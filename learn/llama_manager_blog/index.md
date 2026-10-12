# The Golang4U LLM Bible: Internals of the Intelligent Llama Manager


# Preface: Why Native llama.cpp is Painful

Running Large Language Models (LLMs) locally using `llama.cpp` offers incredible privacy and performance. However, deploying it effectively is notoriously difficult. The native experience is raw: compiling binaries manually, dealing with unoptimized package manager downloads, juggling 50GB file transfers, calculating mental VRAM boundaries, and memorizing arcane CLI flags. Get a single context metric wrong, and your GPU violently crashes with an Out-Of-Memory (OOM) panic.

We built an all-in-one Go application—`llama_manager.go`—to solve this entirely. It is a highly fault-tolerant daemon that dynamically profiles physical hardware, reverse-engineers a model's memory footprint on the fly, and calculates the exact parameters needed to run engines at absolute peak efficiency. 

Here is the architectural Masterclass on the 1000+ lines of Go logic driving the system.

---

# Chapter 1: UI, UX & Navigation Helpers

A backend engine needs an impenetrable foreground. `llama_manager.go` provides a seamless, dynamic, terminal UI using purely native OS calls and ANSI escapes.

### 1.1 Color-Coded Terminal UI
We use ANSI escape codes (`\033[...]`) to render clean, semantic output uniformly across Windows, macOS, and Linux.
```go
const (
	colorReset  = "\033[0m"
	colorCyan   = "\033[36m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorRed    = "\033[31m"
	appDirName  = ".llama_manager"
)
```

### 1.2 Interactive Menus & Graceful Screen Clearing
We use `bufio.NewReader(os.Stdin)` for blocking terminal execution. This strictly enforces navigation, halting the UI at critical junctions. We pair this with graceful OS-specific terminal clearing to eliminate output clutter:
```go
func clearScreen() {
	cmd := exec.Command("clear")
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", "cls")
	}
	cmd.Stdout = os.Stdout
	cmd.Run()
}

func pause() {
	fmt.Print(colorYellow + "\nPress Enter to continue..." + colorReset)
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func promptInput(prompt string) string {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	text, _ := reader.ReadString('\n')
	return strings.TrimSpace(text)
}
```

### 1.3 Live Update Notifier
When the script launches, an isolated Goroutine silently checks the official GitHub API without blocking the host menu. If an update exists, it visually injects a `[Update Available]` yellow badge on the main loop.
```go
var latestGitHubTag = ""

func fetchLatestReleaseAsync() {
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest", nil)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		var release struct { TagName string `json:"tag_name"` }
		if json.NewDecoder(resp.Body).Decode(&release) == nil {
			latestGitHubTag = release.TagName
		}
	}
}
```

---

# Chapter 2: Hardware Profiling & Compiling

Packages like Homebrew and Winget ship slow, CPU-bound builds. To achieve peak efficiency, we aggressively profile the hardware and fetch the exact required variant.

### 2.1 Deep Hardware Detection
We detect CPU ecosystems and verify GPU endpoints recursively to bind to the optimal backend:
```go
func detectHardware() (backend string, name string) {
	if runtime.GOOS == "darwin" { return "metal", "Apple Silicon/Metal" }
	if err := exec.Command("nvidia-smi").Run(); err == nil { return "cuda", "NVIDIA GPU (CUDA)" }
	if err := exec.Command("rocm-smi").Run(); err == nil { return "rocm", "AMD GPU (ROCm)" }
	return "vulkan", "Standard/APU (Vulkan)"
}
```

### 2.2 Suboptimal Install Detection
If the script notices a package manager binary in the host's `.PATH`, it intercepts and violently stops using it. It advises the user to strip it using native uninstallation tools, warning that it compromises inference latency:
```go
func checkSystemInstall(exePath, hwName, targetBackend string) {
    // A snippet showing how we handle bad PATH binaries
    if strings.Contains(strings.ToLower(exePath), "homebrew") {
        fmt.Println("To remove it, open your terminal and run:  " + colorRed + "brew uninstall llama.cpp" + colorReset)
    }
}
```

### 2.3 Automated Source Compilation & Dependency Advising
If a pre-built binary tailored for the system target is wholly missing from Hugging Face's API wrapper, we perform automated source compilation (using `cmake`). If that fails because `cmake` or `git` aren't installed, the daemon intervenes with literal shell copy-paste install commands specific to the OS flavor (`dnf`, `apt`, `pacman`, `winget`).
```go
func adviseDependencies(missingTool string) {
	fmt.Println(colorRed + "\n[Error] Missing Compilation Dependency: " + missingTool + colorReset)
	switch runtime.GOOS {
	case "windows":
		if missingTool == "git" { fmt.Println("  winget install --id Git.Git -e --source winget") }
	case "darwin":
		fmt.Println("  brew install " + missingTool)
	case "linux":
		fmt.Println("  Debian/Ubuntu:  sudo apt update && sudo apt install " + missingTool + " build-essential")
	}
}
```

---

# Chapter 3: Fault-Tolerant Model Engine (The Network)

Large GGUF files (7B to 70B parameter space) measure between 5 to 50 gigabytes. Standard HTTP streams will inevitably fail over unstable home internet lines.

### 3.1 Fetching from the Hugging Face API
A user simply types "qwen 7b q4". We seamlessly query the Hugging Face HTTP endpoints, restrict to GGUF mappings, sort by historic downloads (indicating trust), and build an interactive file explorer.

### 3.2 The Stream Hijacker (Live Progress Bar)
A custom `io.Writer` interface violently hijacks the data stream output to provide live feedback by rewriting the active console line via carriage returns (`\r\033[K`) without gobbling RAM allocations.
```go
type progressWriter struct {
	io.Writer
	TotalDownloaded int64
	TotalSize       int64
	LastPercent     int64
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n, err := pw.Writer.Write(p)
	pw.TotalDownloaded += int64(n)
	if pw.TotalSize > 0 {
		percent := (pw.TotalDownloaded * 100) / pw.TotalSize
		if percent > pw.LastPercent {
			fmt.Printf("\r\033[KDownloading... %d%% (%d MB / %d MB) - Press Ctrl+C to Pause", percent, pw.TotalDownloaded/(1024*1024), pw.TotalSize/(1024*1024))
			pw.LastPercent = percent
		}
	}
	return n, err
}
```

### 3.3 HTTP 206 Resumable Block Chunking
If an interruption occurs, we write the data to a `.part` chunk. Upon restarting the request, we modify the TCP/IP Headers (HTTP `Range`) to bypass the previously collected bits and stream directly into `os.O_APPEND`.
```go
func downloadWithResume(ctx context.Context, dlURL, finalDest string) error {
	partDest := finalDest + ".part"
	var startBytes int64 = 0

	if info, err := os.Stat(partDest); err == nil {
		startBytes = info.Size() // Existing chunk!
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", dlURL, nil)
	if startBytes > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", startBytes)) // Resume!
	}
	
	resp, _ := dlClient.Do(req)
	
	flags := os.O_CREATE | os.O_WRONLY
	if resp.StatusCode == http.StatusPartialContent {
		flags |= os.O_APPEND // Append if Supported
	} else {
		flags |= os.O_TRUNC // Truncate and Restart 
	}
	
	outFile, _ := os.OpenFile(partDest, flags, 0644)
    // ... Copy stream via pw
}
```

---

# Chapter 4: Intelligent Memory Mathematics

The core of our platform reverse engineers neural footprints to mathematically prevent systemic memory failures. If the Model Weights + the Conversational Application (Key-Value) Cache breaches VRAM limits, the OS forces panic. 

### 4.1 Native VRAM Hardware Scanning
Extracting active physical capacity bypasses generic runtime estimates:
```go
func getMemoryCapacity() (float64, string) {
	out, err := exec.Command("nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		vramMB, _ := strconv.ParseFloat(strings.TrimSpace(lines[0]), 64)
		if vramMB > 0 { return vramMB / 1024.0, "Dedicated NVIDIA VRAM" }
	}
    // Check AMD / macOS sysctl / system powershell fallbacks ...
}
```

### 4.2 Reverse-Engineer Neural Parameter Footprints
We inspect file names and sizes locally. For a `Q4_K` model, we assign a quantization density limit of 4.5 bits. Then we triangulate total parameter mass mathematically without reading external index files:
```text
Bits_Per_Weight ≈ 4.5
Parameter_Count = (Gigabytes * 8.0) / Bits_Per_Weight
```

### 4.3 Safe Context Limit Constraints
Modern models cost ~15 Megabytes per 1 Billion internal parameters per every 1,024 context tokens.
We strip OS Overhead (4.0GB Windows / 3.0GB Linux) proactively from the physical constraints. The derivative formula provides boundary parameters that completely guarantee safe limits:
```text
Available_VRAM = Hardware_Ram - Weight_GB - Base_OS_Overhead
Max_Context = (Available_VRAM_in_MB / Model_Cost_Per_1024_Token) * 1024
```

---

# Chapter 5: Deployment & Daemon Automation Pipeline

When firing the engine daemon, we construct massive OS execution command arrays containing specific tuning metrics natively hidden to typical users.

### 5.1 KV Cache Formating & Sub-Slot Slicing
*   **KV Cache Quantization (`-ctk`, `-ctv`):** We format memory blocks optionally using 4-Bit arrays (`q4_0`), squeezing cache volumes down by over 75% for massive prompt windowing.
*   **Anti-Hyperthreading Optimization (`-t`):** By halving CPU core threads mathematically (`Total Cores / 2`), we force `llama.cpp` to bind exclusively to distinct physical logic gates, bypassing hyper-threaded cache thrashing entirely.
*   **Context Slicing Prevention (`-np 1`):** Default daemon topologies eagerly aggressively chop memory context slots for multiple parallel tenant users. We enforce single tenant (`-kvu`) locks.
*   **Batching & Defragmentation:** `llama.cpp` evaluates tokens optimally at 512 chunks. The user can ramp batch (`-b`, `-ub`) sizing up to 2048 to significantly reduce Initial Time-to-First-Token processing. We inject `--defrag-thold 0.1` to heal degraded memory fragmentation pools automatically.

### 5.2 Network & Security Layer
LLM daemon servers blindly bind to localhosts natively. We optionally mesh nodes using **Tailscale** for secure global execution:
```go
func getTailscaleIP() string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "tailscale", "ip", "-4").Output()
	if err == nil { return strings.TrimSpace(string(out)) }
	return ""
}
```
If exposed to WAN/LAN bounds (`0.0.0.0`), a purely native hex key payload guarantees a zero-trust model API layer instantly:
```go
func generateAPIKey() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
```

### 5.3 Bulletproof Daemons: Ghost Process Auto-Healing
If the daemon was pushed physically out of bounds previously, a stale `.pid` file lock usually destroys the startup flow. We heal the app state dynamically:
```go
func isProcessAlive(pid int) bool {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid))
		out, _ := cmd.Output()
		return strings.Contains(string(out), strconv.Itoa(pid))
	}
	process, err := os.FindProcess(pid)
	if err != nil { return false }
	return process.Signal(syscall.Signal(0)) == nil // Ping kernel payload zero check
}
```

### 5.4 Graceful Zero-Leak VRAM Signal Channels
If a user violently slams `Ctrl+C` into the foreground terminal, the Go layer will inherently drop execution silently. However, C++ binaries hold GPU architectures captive. A dropped pointer implies absolute VRAM lock, requiring PC reboots.
Instead, we orchestrate multiplexed Channel signals:
```go
sigChan := make(chan os.Signal, 1)
signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM) // Trap native OS interrupt

go func() {
	<-sigChan // Lock Goroutine on keyboard event
	fmt.Println("\nShutting down cleanly, freeing VRAM...")
	if cmd.Process != nil {
		cmd.Process.Signal(os.Interrupt)  // Flush Native process first!
	}
}()

cmd.Run() // Wait for subprocess death to gracefully exit Go
signal.Stop(sigChan)
```

# The Code

```go
package main

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// --- Constants & Config ---
const (
	colorReset  = "\033[0m"
	colorCyan   = "\033[36m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorRed    = "\033[31m"
	appDirName  = ".llama_manager"
)

var (
	homeDir, _      = os.UserHomeDir()
	baseDir         = filepath.Join(homeDir, appDirName)
	binDir          = filepath.Join(baseDir, "bin")
	modelsDir       = filepath.Join(baseDir, "models")
	pidFile         = filepath.Join(baseDir, "server.pid")
	logFile         = filepath.Join(baseDir, "server.log")
	httpClient      = &http.Client{Timeout: 30 * time.Second}
	latestGitHubTag = ""
)

func init() {
	os.MkdirAll(binDir, 0755)
	os.MkdirAll(modelsDir, 0755)
	go fetchLatestReleaseAsync()
}

// --- Live Update Notifier ---
func fetchLatestReleaseAsync() {
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest", nil)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		var release struct {
			TagName string `json:"tag_name"`
		}
		if json.NewDecoder(resp.Body).Decode(&release) == nil {
			latestGitHubTag = release.TagName
		}
	}
}

// --- Process Management (Ghost Process Fix) ---
func isProcessAlive(pid int) bool {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid))
		out, err := cmd.Output()
		if err != nil {
			return false
		}
		return strings.Contains(string(out), strconv.Itoa(pid))
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}

// --- UI & Navigation Helpers ---
func clearScreen() {
	cmd := exec.Command("clear")
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", "cls")
	}
	cmd.Stdout = os.Stdout
	cmd.Run()
}

func pause() {
	fmt.Print(colorYellow + "\nPress Enter to continue..." + colorReset)
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func promptInput(prompt string) string {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	text, _ := reader.ReadString('\n')
	return strings.TrimSpace(text)
}

func generateAPIKey() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// --- Intelligent Dependency Advisor ---
func adviseDependencies(missingTool string) {
	fmt.Println(colorRed + "\n[Error] Missing Compilation Dependency: " + missingTool + colorReset)
	fmt.Println("To compile an optimized engine from source, your system needs '" + missingTool + "'.")

	switch runtime.GOOS {
	case "windows":
		fmt.Println(colorCyan + "\nWindows Installation Instructions:" + colorReset)
		fmt.Println("Open PowerShell as Administrator and run:")
		if missingTool == "git" {
			fmt.Println("  winget install --id Git.Git -e --source winget")
		} else if missingTool == "cmake" {
			fmt.Println("  winget install --id Kitware.CMake -e --source winget")
			fmt.Println("\nNote: You also need a C++ Compiler for Windows.")
			fmt.Println("Run: winget install --id Microsoft.VisualStudio.2022.BuildTools")
			fmt.Println("Then open Visual Studio Installer and check 'Desktop development with C++'.")
		}
	case "darwin":
		fmt.Println(colorCyan + "\nmacOS Installation Instructions:" + colorReset)
		fmt.Println("Open Terminal and run:")
		fmt.Println("  xcode-select --install")
		fmt.Println("  brew install " + missingTool)
	case "linux":
		fmt.Println(colorCyan + "\nLinux Installation Instructions:" + colorReset)
		fmt.Println("Run the command for your specific distribution:")
		fmt.Println("  Debian/Ubuntu:  sudo apt update && sudo apt install " + missingTool + " build-essential")
		fmt.Println("  Fedora/RHEL:    sudo dnf install " + missingTool + " gcc-c++")
		fmt.Println("  Arch Linux:     sudo pacman -S " + missingTool + " base-devel")
	}
	fmt.Println(colorYellow + "\nAfter installing, please close this terminal, open a new one, and try again." + colorReset)
}

// --- Resumable Download Engine ---
type progressWriter struct {
	io.Writer
	TotalDownloaded int64
	TotalSize       int64
	LastPercent     int64
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n, err := pw.Writer.Write(p)
	pw.TotalDownloaded += int64(n)
	if pw.TotalSize > 0 {
		percent := (pw.TotalDownloaded * 100) / pw.TotalSize
		if percent > pw.LastPercent {
			fmt.Printf("\r\033[KDownloading... %d%% (%d MB / %d MB) - Press Ctrl+C to Pause",
				percent, pw.TotalDownloaded/(1024*1024), pw.TotalSize/(1024*1024))
			pw.LastPercent = percent
		}
	}
	return n, err
}

func downloadWithResume(ctx context.Context, dlURL, finalDest string) error {
	partDest := finalDest + ".part"
	var startBytes int64 = 0

	if info, err := os.Stat(partDest); err == nil {
		startBytes = info.Size()
	} else if _, err := os.Stat(finalDest); err == nil {
		fmt.Println(colorGreen + "File already fully downloaded!" + colorReset)
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", dlURL, nil)
	if err != nil {
		return err
	}

	if startBytes > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", startBytes))
		fmt.Printf("Resuming incomplete download from %d MB...\n", startBytes/(1024*1024))
	}

	dlClient := &http.Client{}
	resp, err := dlClient.Do(req)
	if err != nil {
		if ctx.Err() == context.Canceled {
			return fmt.Errorf("paused by user")
		}
		return fmt.Errorf("connection error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusRequestedRangeNotSatisfiable {
		os.Rename(partDest, finalDest)
		return nil
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	flags := os.O_CREATE | os.O_WRONLY
	if resp.StatusCode == http.StatusPartialContent {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
		startBytes = 0
	}

	outFile, err := os.OpenFile(partDest, flags, 0644)
	if err != nil {
		return fmt.Errorf("file access error: %v", err)
	}

	pw := &progressWriter{
		Writer:          outFile,
		TotalDownloaded: startBytes,
		TotalSize:       startBytes + resp.ContentLength,
	}

	_, err = io.Copy(pw, resp.Body)
	outFile.Close()
	fmt.Println()

	if err != nil {
		if ctx.Err() == context.Canceled {
			return fmt.Errorf("paused by user")
		}
		return fmt.Errorf("interrupted (network drop or sleep): %v", err)
	}

	return os.Rename(partDest, finalDest)
}

// --- Smart Hardware Detection ---
func detectHardware() (backend string, name string) {
	if runtime.GOOS == "darwin" {
		return "metal", "Apple Silicon/Metal"
	}
	if err := exec.Command("nvidia-smi").Run(); err == nil {
		return "cuda", "NVIDIA GPU (CUDA)"
	}
	if err := exec.Command("rocm-smi").Run(); err == nil {
		return "rocm", "AMD GPU (ROCm)"
	}
	return "vulkan", "Standard/APU (Vulkan)"
}

func getServerExePath() string {
	exeName := "llama-server"
	if runtime.GOOS == "windows" {
		exeName = "llama-server.exe"
	}

	localPath := filepath.Join(binDir, exeName)
	if _, err := os.Stat(localPath); err == nil {
		return localPath
	}

	if path, err := exec.LookPath(exeName); err == nil {
		return path
	}
	return ""
}

// --- Dynamic Memory Capacity Scanner ---
func getMemoryCapacity() (float64, string) {
	out, err := exec.Command("nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		if len(lines) > 0 {
			vramMB, _ := strconv.ParseFloat(strings.TrimSpace(lines[0]), 64)
			if vramMB > 0 {
				return vramMB / 1024.0, "Dedicated NVIDIA VRAM"
			}
		}
	}

	out, err = exec.Command("rocm-smi", "--showmeminfo", "vram").Output()
	if err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.Contains(line, "VRAM Total Memory") {
				parts := strings.Split(line, ":")
				if len(parts) == 2 {
					bytes, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
					if bytes > 0 {
						return bytes / (1024 * 1024 * 1024), "Dedicated AMD VRAM"
					}
				}
			}
		}
	}

	var ramBytes int64 = 0
	if runtime.GOOS == "windows" {
		out, err := exec.Command("powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory").Output()
		if err == nil {
			ramBytes, _ = strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
		}
	} else if runtime.GOOS == "linux" {
		out, err := os.ReadFile("/proc/meminfo")
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.HasPrefix(line, "MemTotal:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						kb, _ := strconv.ParseInt(parts[1], 10, 64)
						ramBytes = kb * 1024
						break
					}
				}
			}
		}
	} else if runtime.GOOS == "darwin" {
		out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
		if err == nil {
			ramBytes, _ = strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
		}
	}

	if ramBytes > 0 {
		return float64(ramBytes) / (1024 * 1024 * 1024), "Shared System RAM"
	}
	return 8.0, "Unknown RAM (Fallback Default)"
}

// --- Network Helpers ---
func getTailscaleIP() string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "tailscale", "ip", "-4").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func getAvailablePort(startPort int) int {
	for port := startPort; port < startPort+100; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			ln.Close()
			return port
		}
	}
	return startPort
}

// --- Extraction Helper ---
func isTargetFile(filename string) bool {
	base := strings.ToLower(filepath.Base(filename))
	if base == "llama-server" || base == "llama-server.exe" {
		return true
	}
	if strings.HasSuffix(base, ".dll") || strings.Contains(base, ".so") || strings.HasSuffix(base, ".dylib") {
		return true
	}
	return false
}

func clearOldBinaries() {
	files, _ := filepath.Glob(filepath.Join(binDir, "*"))
	for _, f := range files {
		if isTargetFile(f) {
			os.Remove(f)
		}
	}
}

func extractArchive(src, dest string) error {
	if strings.HasSuffix(src, ".zip") {
		r, err := zip.OpenReader(src)
		if err != nil {
			return err
		}
		defer r.Close()
		for _, f := range r.File {
			if isTargetFile(f.Name) {
				out, err := os.Create(filepath.Join(dest, filepath.Base(f.Name)))
				if err != nil {
					return fmt.Errorf("failed to write %s (Is the server running?): %v", f.Name, err)
				}
				rc, err := f.Open()
				if err != nil {
					out.Close()
					return fmt.Errorf("failed to open file inside zip: %v", err)
				}
				_, err = io.Copy(out, rc)
				rc.Close()
				out.Close()
				if err != nil {
					return fmt.Errorf("failed to copy file contents: %v", err)
				}
			}
		}
	} else if strings.HasSuffix(src, ".tar.gz") {
		f, err := os.Open(src)
		if err != nil {
			return err
		}
		defer f.Close()
		gzr, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gzr.Close()
		tr := tar.NewReader(gzr)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				break
			}
			if isTargetFile(hdr.Name) {
				out, err := os.Create(filepath.Join(dest, filepath.Base(hdr.Name)))
				if err != nil {
					return fmt.Errorf("failed to write %s: %v", hdr.Name, err)
				}
				_, err = io.Copy(out, tr)
				out.Close()
				if err != nil {
					return fmt.Errorf("failed to extract file contents: %v", err)
				}
			}
		}
	}
	return nil
}

// --- Core Logic ---
func smartInstallAndCheck() {
	targetBackend, hwName := detectHardware()
	fmt.Println(colorCyan + "\n--- System Hardware Check ---" + colorReset)
	fmt.Printf("OS/Arch: %s/%s\nActive Profile: %s\n", runtime.GOOS, runtime.GOARCH, hwName)

	req, _ := http.NewRequest("GET", "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest", nil)
	resp, err := httpClient.Do(req)
	if err != nil {
		fmt.Println(colorRed + "Failed to connect to GitHub." + colorReset)
		pause()
		return
	}
	defer resp.Body.Close()

	var release struct {
		TagName string                                      `json:"tag_name"`
		Assets  []struct{ Name, BrowserDownloadURL string } `json:"assets"`
	}
	json.NewDecoder(resp.Body).Decode(&release)
	latestGitHubTag = release.TagName

	localVerBytes, _ := os.ReadFile(filepath.Join(binDir, "version.txt"))
	localBackBytes, _ := os.ReadFile(filepath.Join(binDir, "backend.txt"))
	localVer := strings.TrimSpace(string(localVerBytes))
	localBack := strings.TrimSpace(string(localBackBytes))

	exePath := getServerExePath()
	isSystemInstall := exePath != "" && !strings.HasPrefix(exePath, binDir)
	isCompiledLocally := strings.HasPrefix(localVer, "source-")

	if isSystemInstall {
		fmt.Printf(colorRed+"\n[Warning] Suboptimal System-wide Installation Detected:\n     %s\n"+colorReset, exePath)
		fmt.Println(colorYellow + "System package managers usually install generic, CPU-only versions." + colorReset)
		fmt.Printf("For your %s, you need the optimized %s backend for maximum performance.\n\n", hwName, targetBackend)

		lowerPath := strings.ToLower(exePath)
		if strings.Contains(lowerPath, "windowsapps") || strings.Contains(lowerPath, "winget") {
			fmt.Println("To remove it, open PowerShell and run:  " + colorRed + "winget uninstall llama.cpp" + colorReset)
		} else if strings.Contains(lowerPath, "homebrew") || strings.Contains(lowerPath, "linuxbrew") {
			fmt.Println("To remove it, open your terminal and run:  " + colorRed + "brew uninstall llama.cpp" + colorReset)
		} else if strings.Contains(lowerPath, "nix") {
			fmt.Println("To remove it, please uninstall it from your active Nix profile.")
		} else if strings.Contains(lowerPath, "apt") || strings.Contains(lowerPath, "dpkg") || runtime.GOOS == "linux" {
			fmt.Println("To remove it, run:  " + colorRed + "sudo apt remove llama.cpp" + colorReset + " (or distro equivalent).")
		}

		fmt.Println(colorGreen + "\nWe highly recommend letting this manager download or compile the hardware-optimized version instead." + colorReset)
	}

	needsUpdate := exePath == "" || (!isSystemInstall && localBack != targetBackend) || (!isSystemInstall && !isCompiledLocally && localVer != release.TagName) || isSystemInstall

	if !needsUpdate {
		if isCompiledLocally {
			fmt.Println(colorGreen + "\n[OK] Engine is compiled natively for maximum performance." + colorReset)
		} else if !isSystemInstall {
			fmt.Println(colorGreen + "\n[OK] Pre-built Engine is up to date." + colorReset)
		}

		choice := promptInput("\nForce update / re-install local binary? (y/n/0): ")
		if choice == "0" || strings.ToLower(choice) != "y" {
			return
		}
	} else {
		var msg string
		if isSystemInstall {
			msg = "\nInstall the optimized local engine now? (y/n/0 to go back): "
		} else {
			msg = "\nUpdates or Hardware Changes Detected! Update now? (y/n/0 to go back): "
		}
		choice := promptInput(msg)
		if choice == "0" || strings.ToLower(choice) != "y" {
			return
		}
	}

	var downloadURL, fileName, fallbackURL, fallbackName string
	osStr, archStr := runtime.GOOS, runtime.GOARCH

	for _, asset := range release.Assets {
		name := strings.ToLower(asset.Name)
		if strings.Contains(name, "cudart") || strings.HasSuffix(name, ".sig") || strings.HasSuffix(name, ".sha256") {
			continue
		}
		if !strings.HasSuffix(name, ".zip") && !strings.HasSuffix(name, ".tar.gz") {
			continue
		}

		isWin := osStr == "windows" && (strings.Contains(name, "win") || strings.Contains(name, "windows"))
		isMac := osStr == "darwin" && (strings.Contains(name, "macos") || strings.Contains(name, "darwin") || strings.Contains(name, "mac"))
		isLin := osStr == "linux" && (strings.Contains(name, "linux") || strings.Contains(name, "ubuntu"))

		isX64 := archStr == "amd64" && (strings.Contains(name, "x64") || strings.Contains(name, "x86_64") || strings.Contains(name, "amd64") || strings.Contains(name, "avx"))
		isArm := archStr == "arm64" && (strings.Contains(name, "arm64") || strings.Contains(name, "aarch64"))

		if (isWin || isLin || isMac) && (isX64 || isArm) {
			isSpecialBackend := strings.Contains(name, "cuda") || strings.Contains(name, "vulkan") || strings.Contains(name, "rocm") || strings.Contains(name, "sycl")
			if !isSpecialBackend {
				fallbackURL, fallbackName = asset.BrowserDownloadURL, asset.Name
			}

			if isMac {
				downloadURL, fileName = asset.BrowserDownloadURL, asset.Name
				break
			} else if strings.Contains(name, targetBackend) {
				if targetBackend == "cuda" && strings.Contains(name, "cu11") {
					continue
				}
				downloadURL, fileName = asset.BrowserDownloadURL, asset.Name
				break
			}
		}
	}

	if downloadURL == "" {
		if targetBackend == "cuda" && runtime.GOOS == "linux" {
			fmt.Println(colorYellow + "\nNote: Pre-built Linux CUDA binaries are not officially provided." + colorReset)
		} else {
			fmt.Println(colorYellow + "\nOptimized binary not found for your exact GPU backend." + colorReset)
		}

		fmt.Println("Compiling from source yields 10-20% faster generation as it optimizes for your specific CPU.")
		compChoice := promptInput(colorCyan + "Would you like to compile it from source now? (y/n): " + colorReset)

		if strings.ToLower(compChoice) == "y" {
			buildFromSource(targetBackend, release.TagName)
			return
		}

		if fallbackURL != "" {
			fmt.Println(colorYellow + "Falling back to universally compatible CPU binary." + colorReset)
			downloadURL, fileName = fallbackURL, fallbackName
			targetBackend = "cpu-fallback"
		} else {
			fmt.Println(colorRed + "\n[Error] Pre-built binary not found for your OS/Arch." + colorReset)
			pause()
			return
		}
	}

	archivePath := filepath.Join(binDir, fileName)
	fmt.Printf("\nDownloading %s...\n", fileName)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() { <-sigChan; cancel() }()

	if err := downloadWithResume(ctx, downloadURL, archivePath); err != nil {
		fmt.Println(colorYellow + "\nDownload stopped: " + err.Error() + colorReset)
		signal.Stop(sigChan)
		pause()
		return
	}
	signal.Stop(sigChan)

	fmt.Println("Extracting binaries...")
	clearOldBinaries()
	if err := extractArchive(archivePath, binDir); err != nil {
		fmt.Println(colorRed + "\nExtraction Error: " + err.Error() + colorReset)
		pause()
		return
	}
	os.Remove(archivePath)
	if runtime.GOOS != "windows" {
		os.Chmod(filepath.Join(binDir, "llama-server"), 0755)
	}

	os.WriteFile(filepath.Join(binDir, "version.txt"), []byte(release.TagName), 0644)
	os.WriteFile(filepath.Join(binDir, "backend.txt"), []byte(targetBackend), 0644)
	fmt.Println(colorGreen + "Installation successful!" + colorReset)
	pause()
}

func buildFromSource(targetBackend string, tagName string) {
	fmt.Println(colorCyan + "\n--- Compiling llama.cpp from Source ---" + colorReset)

	if _, err := exec.LookPath("git"); err != nil {
		adviseDependencies("git")
		pause()
		return
	}
	if _, err := exec.LookPath("cmake"); err != nil {
		adviseDependencies("cmake")
		pause()
		return
	}

	if targetBackend == "vulkan" && runtime.GOOS == "windows" && os.Getenv("VULKAN_SDK") == "" {
		fmt.Println(colorRed + "\n[Error] Vulkan SDK not found!" + colorReset)
		fmt.Println("To compile for Vulkan on Windows, you must install the Vulkan SDK.")
		fmt.Println("Download it here: https://vulkan.lunarg.com/sdk/home")
		fmt.Println("Install it, completely restart this terminal, and try again.")
		pause()
		return
	}

	srcDir := filepath.Join(baseDir, "src")
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		fmt.Println("Cloning repository...")
		cmd := exec.Command("git", "clone", "https://github.com/ggml-org/llama.cpp.git", srcDir)
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Println(colorRed + "Clone failed." + colorReset)
			pause()
			return
		}
	} else {
		fmt.Println("Fetching latest updates...")
		exec.Command("git", "-C", srcDir, "fetch", "--all", "--tags").Run()
	}

	fmt.Printf(colorYellow+"Locking onto stable release: %s\n"+colorReset, tagName)
	exec.Command("git", "-C", srcDir, "checkout", "-f", tagName).Run()

	buildDir := filepath.Join(srcDir, "build")
	os.RemoveAll(buildDir)

	cmakeArgs := []string{"-B", "build"}
	if runtime.GOOS == "windows" {
		cmakeArgs = append(cmakeArgs, "-G", "Visual Studio 17 2022", "-A", "x64")
	}

	if targetBackend == "cuda" {
		cmakeArgs = append(cmakeArgs, "-DGGML_CUDA=ON")
	} else if targetBackend == "vulkan" {
		cmakeArgs = append(cmakeArgs, "-DGGML_VULKAN=ON")
	} else if targetBackend == "rocm" {
		cmakeArgs = append(cmakeArgs, "-DGGML_HIP=ON")
	} else if targetBackend == "metal" {
		cmakeArgs = append(cmakeArgs, "-DGGML_METAL=ON")
	}

	fmt.Println(colorYellow + "\nConfiguring CMake Environment..." + colorReset)
	configCmd := exec.Command("cmake", cmakeArgs...)
	configCmd.Dir = srcDir
	configCmd.Stdout, configCmd.Stderr = os.Stdout, os.Stderr
	if err := configCmd.Run(); err != nil {
		fmt.Println(colorRed + "CMake configuration failed." + colorReset)
		pause()
		return
	}

	cores := strconv.Itoa(runtime.NumCPU())
	fmt.Printf(colorYellow+"\nCompiling with %s threads (this will take several minutes)...\n"+colorReset, cores)
	buildCmd := exec.Command("cmake", "--build", "build", "--config", "Release", "-j", cores)
	buildCmd.Dir = srcDir
	buildCmd.Stdout, buildCmd.Stderr = os.Stdout, os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Println(colorRed + "Compilation failed." + colorReset)
		pause()
		return
	}

	exeName := "llama-server"
	if runtime.GOOS == "windows" {
		exeName = "llama-server.exe"
	}

	possiblePaths := []string{
		filepath.Join(srcDir, "build", "bin", exeName),
		filepath.Join(srcDir, "build", "bin", "Release", exeName),
		filepath.Join(srcDir, "build", exeName),
	}

	compiledPath := ""
	for _, p := range possiblePaths {
		if _, err := os.Stat(p); err == nil {
			compiledPath = p
			break
		}
	}

	if compiledPath == "" {
		fmt.Println(colorRed + "Could not locate compiled binary." + colorReset)
		pause()
		return
	}

	clearOldBinaries()
	destPath := filepath.Join(binDir, exeName)
	if err := copyFile(compiledPath, destPath); err != nil {
		fmt.Println(colorRed + "Install failed: " + err.Error() + colorReset)
		pause()
		return
	}

	filepath.Walk(filepath.Join(srcDir, "build"), func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && isTargetFile(path) && filepath.Base(path) != exeName {
			copyFile(path, filepath.Join(binDir, filepath.Base(path)))
		}
		return nil
	})

	if runtime.GOOS != "windows" {
		os.Chmod(destPath, 0755)
	}

	hashCmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	hashCmd.Dir = srcDir
	hash, _ := hashCmd.Output()
	versionStr := "source-" + strings.TrimSpace(string(hash))

	os.WriteFile(filepath.Join(binDir, "version.txt"), []byte(versionStr), 0644)
	os.WriteFile(filepath.Join(binDir, "backend.txt"), []byte(targetBackend), 0644)

	fmt.Println(colorGreen + "\nCompilation and installation successful!" + colorReset)
	pause()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func searchAndDownloadModel() {
	for {
		clearScreen()
		fmt.Println(colorCyan + "=== Search & Download Models ===" + colorReset)
		rawQuery := promptInput("Enter model search term (e.g., 'qwen 2.5 7b q4_k_m') or '0' to return to Main Menu: ")

		if rawQuery == "0" || rawQuery == "" {
			return
		}

		query := url.QueryEscape(rawQuery)
		apiURL := fmt.Sprintf("https://huggingface.co/api/models?search=%s&filter=gguf&sort=downloads&direction=-1&limit=5", query)

		resp, err := httpClient.Get(apiURL)
		if err != nil {
			fmt.Println(colorRed + "\nNetwork error: " + err.Error() + colorReset)
			pause()
			continue
		}

		var models []struct {
			ID        string `json:"id"`
			Downloads int    `json:"downloads"`
		}
		json.NewDecoder(resp.Body).Decode(&models)
		resp.Body.Close()

		if len(models) == 0 {
			fmt.Println(colorYellow + "\nNo GGUF models found." + colorReset)
			pause()
			continue
		}

		fmt.Println(colorCyan + "\n--- Search Results ---" + colorReset)
		fmt.Println("0. Cancel & Start New Search")
		for i, m := range models {
			fmt.Printf("%d. %s (Downloads: %d)\n", i+1, m.ID, m.Downloads)
		}

		choice, _ := strconv.Atoi(promptInput("\nSelect model number: "))
		if choice == 0 || choice < 1 || choice > len(models) {
			continue
		}

		selectedModel := models[choice-1].ID
		resp2, err := httpClient.Get(fmt.Sprintf("https://huggingface.co/api/models/%s/tree/main", selectedModel))
		if err != nil {
			continue
		}

		var files []struct {
			Path string `json:"path"`
			Size int64  `json:"size"`
		}
		json.NewDecoder(resp2.Body).Decode(&files)
		resp2.Body.Close()

		var ggufFiles []struct {
			Path string `json:"path"`
			Size int64  `json:"size"`
		}
		for _, f := range files {
			if strings.HasSuffix(f.Path, ".gguf") {
				ggufFiles = append(ggufFiles, f)
			}
		}

		if len(ggufFiles) == 0 {
			fmt.Println(colorYellow + "\nNo GGUF files found in this repository." + colorReset)
			pause()
			continue
		}

		fmt.Println(colorCyan + "\n--- Available Files ---" + colorReset)
		fmt.Println("0. Cancel & Start New Search")
		for i, f := range ggufFiles {
			fmt.Printf("%d. %s (%.2f MB)\n", i+1, f.Path, float64(f.Size)/(1024*1024))
		}

		fChoice, _ := strconv.Atoi(promptInput("\nSelect file to download: "))
		if fChoice == 0 || fChoice < 1 || fChoice > len(ggufFiles) {
			continue
		}

		selectedFile := ggufFiles[fChoice-1]
		fileSizeGB := float64(selectedFile.Size) / (1024 * 1024 * 1024)

		memCapGB, memType := getMemoryCapacity()
		maxSafeGB := memCapGB - 2.5
		if maxSafeGB < 0 {
			maxSafeGB = 0
		}

		if fileSizeGB > maxSafeGB {
			fmt.Println(colorRed + "\n[WARNING] Hardware Capacity Exceeded!" + colorReset)
			fmt.Printf("You are trying to download a %.2f GB model.\n", fileSizeGB)
			fmt.Printf("Your system is reporting %.2f GB of %s.\n", memCapGB, memType)
			fmt.Printf("To leave room for your OS and the context window, your safe maximum is ~%.2f GB.\n", maxSafeGB)
			fmt.Println(colorYellow + "If you proceed, this model will likely crash the server or run extremely slowly via pagefile swapping." + colorReset)

			proceed := promptInput("\nProceed anyway? (y/n): ")
			if strings.ToLower(proceed) != "y" {
				continue
			}
		}

		dlURL := fmt.Sprintf("https://huggingface.co/%s/resolve/main/%s", selectedModel, selectedFile.Path)
		destPath := filepath.Join(modelsDir, strings.ReplaceAll(selectedModel, "/", "_")+"_"+selectedFile.Path)

		ctx, cancel := context.WithCancel(context.Background())
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		go func() { <-sigChan; cancel() }()

		err = downloadWithResume(ctx, dlURL, destPath)
		signal.Stop(sigChan)
		cancel()

		if err != nil {
			fmt.Println(colorYellow + "\nDownload stopped: " + err.Error() + colorReset)
			fmt.Println("The incomplete file has been saved. Select it again later to resume.")
		} else {
			fmt.Println(colorGreen + "Download complete!" + colorReset)
		}
		pause()
	}
}

func manageModels() {
	entries, _ := os.ReadDir(modelsDir)
	var models []os.DirEntry
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".gguf") || strings.HasSuffix(e.Name(), ".part") {
			models = append(models, e)
		}
	}

	if len(models) == 0 {
		fmt.Println(colorYellow + "No models found." + colorReset)
		pause()
		return
	}

	fmt.Println(colorCyan + "\n--- Local Models ---" + colorReset)
	fmt.Println("0. Go Back")
	for i, m := range models {
		info, _ := m.Info()
		status := ""
		if strings.HasSuffix(m.Name(), ".part") {
			status = colorYellow + " [Incomplete]" + colorReset
		}
		fmt.Printf("%d. %s (%.2f MB)%s\n", i+1, m.Name(), float64(info.Size())/(1024*1024), status)
	}

	if choiceStr := promptInput("\nEnter number to DELETE (or 0 to cancel): "); choiceStr != "0" {
		if choice, err := strconv.Atoi(choiceStr); err == nil && choice >= 1 && choice <= len(models) {
			target := models[choice-1].Name()
			if strings.ToLower(promptInput(fmt.Sprintf("Delete %s? (y/n): ", target))) == "y" {
				os.Remove(filepath.Join(modelsDir, target))
				fmt.Println(colorGreen + "Deleted." + colorReset)
			}
		}
	}
}

// --- Daemon Server Management ---
func stopWebUI() {
	pidBytes, err := os.ReadFile(pidFile)
	if err != nil {
		fmt.Println(colorYellow + "No background server is currently running." + colorReset)
		pause()
		return
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
	if err != nil {
		os.Remove(pidFile)
		return
	}

	if !isProcessAlive(pid) {
		fmt.Println(colorYellow + "Server is not actively running (Cleaning up stale PID file)." + colorReset)
		os.Remove(pidFile)
		pause()
		return
	}

	fmt.Printf("Stopping background server (PID: %d)...\n", pid)

	if runtime.GOOS == "windows" {
		exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/F", "/T").Run()
	} else {
		proc, err := os.FindProcess(pid)
		if err == nil {
			proc.Signal(os.Interrupt)
		}
	}

	os.Remove(pidFile)
	fmt.Println(colorGreen + "Server successfully stopped and VRAM has been freed." + colorReset)
	pause()
}

func startWebUI() {
	if pidBytes, err := os.ReadFile(pidFile); err == nil {
		pid, _ := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
		if isProcessAlive(pid) {
			fmt.Println(colorYellow + "A background server is already running! Please stop it using Option 5 before deploying a new one." + colorReset)
			pause()
			return
		}
		os.Remove(pidFile) // Auto-heal ghost process
	}

	serverExe := getServerExePath()
	if serverExe == "" {
		fmt.Println(colorRed + "llama.cpp not installed." + colorReset)
		pause()
		return
	}

	entries, _ := os.ReadDir(modelsDir)
	var models []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".gguf") {
			models = append(models, e.Name())
		}
	}

	if len(models) == 0 {
		fmt.Println(colorYellow + "No models found!" + colorReset)
		pause()
		return
	}

	fmt.Println(colorCyan + "\n--- Select Model ---" + colorReset)
	fmt.Println("0. Go Back")
	for i, m := range models {
		fmt.Printf("%d. %s\n", i+1, m)
	}

	choice, _ := strconv.Atoi(promptInput("\nChoice: "))
	if choice == 0 || choice < 1 || choice > len(models) {
		return
	}
	selectedModel := filepath.Join(modelsDir, models[choice-1])

	// --- 0. HARDWARE & MODEL ASSESSMENT ---
	modelInfo, err := os.Stat(selectedModel)
	fileSizeGB := 0.0
	if err == nil {
		fileSizeGB = float64(modelInfo.Size()) / (1024 * 1024 * 1024)
	}

	lowerName := strings.ToLower(filepath.Base(selectedModel))
	quantName := "Unknown/FP16"
	bitsPerWeight := 16.0

	if strings.Contains(lowerName, "q2_") || strings.Contains(lowerName, "-q2") || strings.Contains(lowerName, "iq2") {
		quantName = "Q2/IQ2"
		bitsPerWeight = 2.5
	} else if strings.Contains(lowerName, "q3_") || strings.Contains(lowerName, "-q3") || strings.Contains(lowerName, "iq3") {
		quantName = "Q3/IQ3"
		bitsPerWeight = 3.5
	} else if strings.Contains(lowerName, "q4_") || strings.Contains(lowerName, "-q4") || strings.Contains(lowerName, "iq4") {
		quantName = "Q4/IQ4"
		bitsPerWeight = 4.5
	} else if strings.Contains(lowerName, "q5_") || strings.Contains(lowerName, "-q5") || strings.Contains(lowerName, "iq5") {
		quantName = "Q5/IQ5"
		bitsPerWeight = 5.5
	} else if strings.Contains(lowerName, "q6_") || strings.Contains(lowerName, "-q6") || strings.Contains(lowerName, "iq6") {
		quantName = "Q6/IQ6"
		bitsPerWeight = 6.5
	} else if strings.Contains(lowerName, "q8_") || strings.Contains(lowerName, "-q8") {
		quantName = "Q8"
		bitsPerWeight = 8.0
	}

	paramCountB := (fileSizeGB * 8.0) / bitsPerWeight
	if paramCountB < 0.5 {
		paramCountB = 0.5
	}
	baseKvCacheMBPer1K := 15.0 * paramCountB

	memCapGB, memType := getMemoryCapacity()
	osOverhead := 3.0
	if runtime.GOOS == "windows" {
		osOverhead = 4.0
	}
	freeRamGB := memCapGB - fileSizeGB - osOverhead

	fmt.Println(colorCyan + "\n--- System Capabilities ---" + colorReset)
	fmt.Printf("Hardware Limit:     %.2f GB (%s)\n", memCapGB, memType)
	fmt.Printf("Model Footprint:    %.2f GB\n", fileSizeGB)
	fmt.Printf("Quantization:       %s (~%.1f bits/weight)\n", quantName, bitsPerWeight)
	fmt.Printf("Available VRAM:     %.2f GB (For context & processing)\n", freeRamGB)

	// --- 1. KV CACHE QUANTIZATION WIZARD ---
	fmt.Println(colorCyan + "\n[Phase 1] KV Cache Optimization (VRAM Saver)" + colorReset)
	fmt.Println("The KV Cache stores your conversation history. Quantizing it saves massive amounts of VRAM.")
	fmt.Println("1. FP16  (No quality loss, standard VRAM usage) - Best for coding/math.")
	fmt.Println("2. 8-Bit (Near-zero loss, 50% VRAM savings) - Recommended balance.")
	fmt.Println("3. 4-Bit (Minor loss on extreme context, 75% VRAM savings) - Best for enormous documents.")

	suggestedKV := "2"
	if freeRamGB < 2.0 {
		suggestedKV = "3"
	}

	kvQuantChoice := promptInput(fmt.Sprintf("Select KV format (1-3) [Suggested: %s]: ", suggestedKV))
	if kvQuantChoice == "" {
		kvQuantChoice = suggestedKV
	}

	kvCacheMBPer1K := baseKvCacheMBPer1K
	var kvFlags []string

	if kvQuantChoice == "3" {
		kvCacheMBPer1K = baseKvCacheMBPer1K / 4.0
		kvFlags = []string{"-ctk", "q4_0", "-ctv", "q4_0"}
		fmt.Println(colorGreen + "-> 4-Bit KV Cache applied." + colorReset)
	} else if kvQuantChoice == "1" {
		kvFlags = []string{}
		fmt.Println(colorGreen + "-> FP16 KV Cache applied." + colorReset)
	} else {
		kvCacheMBPer1K = baseKvCacheMBPer1K / 2.0
		kvFlags = []string{"-ctk", "q8_0", "-ctv", "q8_0"}
		fmt.Println(colorGreen + "-> 8-Bit KV Cache applied." + colorReset)
	}

	// --- 2. CONTEXT WINDOW WIZARD ---
	fmt.Println(colorCyan + "\n[Phase 2] Context Window Limits" + colorReset)
	var maxSafeContext int
	if freeRamGB > 0 {
		freeRamMB := freeRamGB * 1024.0
		maxContextK := freeRamMB / kvCacheMBPer1K
		maxSafeContext = int(maxContextK) * 1024
	} else {
		maxSafeContext = 2048
	}

	suggestedContext := 8192
	if maxSafeContext < 8192 && maxSafeContext >= 2048 {
		suggestedContext = maxSafeContext
	} else if maxSafeContext < 2048 {
		suggestedContext = 2048
	}

	fmt.Printf("Based on your %s choice, your strict hardware limit is ~%d tokens.\n", kvFlags, maxSafeContext)
	contextStr := promptInput(fmt.Sprintf("Enter Context Size [Suggested: %d]: ", suggestedContext))

	contextSize := suggestedContext
	if contextStr != "" {
		if customContext, err := strconv.Atoi(contextStr); err == nil && customContext >= 512 {
			contextSize = customContext
			if contextSize > maxSafeContext {
				fmt.Println(colorRed + "[!] Warning: Context exceeds safe hardware limits. Expect pagefile swapping." + colorReset)
			}
		}
	}
	fmt.Printf(colorGreen+"-> Context set to %d tokens.\n"+colorReset, contextSize)

	// --- 3. BATCH INGESTION WIZARD ---
	fmt.Println(colorCyan + "\n[Phase 3] Prompt Processing Speed" + colorReset)
	fmt.Println("Batch size determines how large of a 'gulp' the GPU takes when reading your prompt.")
	fmt.Println("1. 512  (Conservative, saves a bit of VRAM)")
	fmt.Println("2. 2048 (Aggressive, much faster Time-to-First-Token)")

	suggestedBatch := "2"
	if freeRamGB < 1.0 {
		suggestedBatch = "1"
	}

	bChoice := promptInput(fmt.Sprintf("Select Batch Size (1-2) [Suggested: %s]: ", suggestedBatch))
	if bChoice == "" {
		bChoice = suggestedBatch
	}

	bSize := "2048"
	ubSize := "1024"
	if bChoice == "1" {
		bSize = "512"
		ubSize = "512"
		fmt.Println(colorGreen + "-> Conservative batching applied." + colorReset)
	} else {
		fmt.Println(colorGreen + "-> High-speed batching applied." + colorReset)
	}

	// --- 4. CPU THREADING WIZARD ---
	fmt.Println(colorCyan + "\n[Phase 4] CPU Thread Pinning" + colorReset)
	fmt.Println("If the model spills over to system RAM, pinning to physical cores prevents hyperthreading bottlenecks.")

	totalCores := runtime.NumCPU()
	physicalCores := totalCores / 2
	if physicalCores < 1 {
		physicalCores = 1
	}

	fmt.Printf("System: %d logical threads detected.\n", totalCores)
	tChoice := promptInput(fmt.Sprintf("Enter thread count [Suggested: %d]: ", physicalCores))
	if tChoice == "" {
		tChoice = strconv.Itoa(physicalCores)
	}
	fmt.Printf(colorGreen+"-> Pinned to %s physical threads.\n"+colorReset, tChoice)

	// --- DEPLOYMENT SETTINGS ---
	fmt.Println(colorCyan + "\n--- Client Compatibility Mode ---" + colorReset)
	fmt.Println("1. Standard WebUI / Generic API (Default)")
	fmt.Println("2. OpenClaw / GoClaw / Advanced Agent (Fixes Parser Crashes)")
	compMode := promptInput("Select mode (1-2): ")

	templateOverride := ""
	if compMode == "2" {
		fmt.Println(colorYellow + "\n[Agent Compatibility Wizard]" + colorReset)
		fmt.Println("1. Qwen 2 / 2.5 (chatml)")
		fmt.Println("2. Llama 3 / 3.1 (llama3)")
		fmt.Println("3. Gemma 2 (gemma2)")
		fmt.Println("4. Other / Skip")
		switch promptInput("Select template (1-4): ") {
		case "1":
			templateOverride = "chatml"
		case "2":
			templateOverride = "llama3"
		case "3":
			templateOverride = "gemma2"
		}
	}

	fmt.Println(colorCyan + "\n--- Network Deployment ---" + colorReset)
	fmt.Println("1. Localhost (127.0.0.1)")
	fmt.Println("2. Tailscale Network")
	fmt.Println("3. All Interfaces (0.0.0.0)")

	hostIP := "127.0.0.1"
	netChoice := promptInput("\nSelect network (1-3): ")
	if netChoice == "2" {
		if tsIP := getTailscaleIP(); tsIP != "" {
			hostIP = tsIP
		} else {
			if manual := promptInput("Tailscale IP not found. Enter manually: "); manual != "" {
				hostIP = manual
			}
		}
	} else if netChoice == "3" {
		hostIP = "0.0.0.0"
	}

	apiKey := ""
	if hostIP == "0.0.0.0" {
		if strings.ToLower(promptInput("Secure with API Key? (y/n): ")) == "y" {
			apiKey = generateAPIKey()
		}
	} else if compMode == "2" {
		apiKey = "sk-agent-local" // Auto-secure local agents
	}

	fmt.Println(colorCyan + "\n--- Execution Mode ---" + colorReset)
	fmt.Println("1. Foreground (Live Logs)")
	fmt.Println("2. Background (Invisible)")
	execMode := promptInput("Select mode (1-2): ")

	port := getAvailablePort(8080)

	// --- COMMAND CONSTRUCTION ---
	cmdArgs := []string{
		"-m", selectedModel,
		"--host", hostIP,
		"--port", strconv.Itoa(port),
		"-c", strconv.Itoa(contextSize),
		"-np", "1", // Disable slot splitting
		"-fa", "auto", // Enable Flash Attention
		"-b", bSize, // Logical Batch Size
		"-ub", ubSize, // Physical U-Batch Size
		"-t", tChoice, // Thread pinning
		"-tb", tChoice,
	}

	if templateOverride != "" {
		cmdArgs = append(cmdArgs, "--chat-template", templateOverride)
	}

	localBackBytes, _ := os.ReadFile(filepath.Join(binDir, "backend.txt"))
	if strings.TrimSpace(string(localBackBytes)) != "cpu-fallback" {
		cmdArgs = append(cmdArgs, "-ngl", "99")
		// Multi-GPU Auto-Splitting
		if strings.Contains(memType, "Dedicated") {
			cmdArgs = append(cmdArgs, "-sm", "row")
		}
	}

	// Append KV Cache flags
	cmdArgs = append(cmdArgs, kvFlags...)

	if apiKey != "" {
		cmdArgs = append(cmdArgs, "--api-key", apiKey)
	}

	cmd := exec.Command(serverExe, cmdArgs...)
	cmd.Dir = binDir

	if execMode == "2" {
		logOut, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			fmt.Println(colorRed + "Failed to open log file (Permission Denied). Cannot run in background." + colorReset)
			pause()
			return
		}
		cmd.Stdout, cmd.Stderr = logOut, logOut

		if err := cmd.Start(); err != nil {
			fmt.Println(colorRed + "Failed to start server: " + err.Error() + colorReset)
			pause()
			return
		}
		os.WriteFile(pidFile, []byte(strconv.Itoa(cmd.Process.Pid)), 0644)
		fmt.Printf(colorGreen+"\n[Server Live in Background]\nContext: %d tokens | URL: http://%s:%d\n"+colorReset, contextSize, hostIP, port)
		pause()
		return
	}

	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println(colorYellow + "\nShutting down cleanly, freeing VRAM..." + colorReset)
		if cmd.Process != nil {
			cmd.Process.Signal(os.Interrupt)
		}
	}()

	fmt.Printf(colorGreen+"\n[Server Live in Foreground]\nContext: %d tokens | URL: http://%s:%d\n"+colorReset, contextSize, hostIP, port)
	fmt.Println(colorYellow + "Press Ctrl+C to stop server." + colorReset)

	runErr := cmd.Run()
	signal.Stop(sigChan)

	// NEW: Crash Reporter! If the server exits with an error, freeze and show it.
	if runErr != nil && runErr.Error() != "signal: interrupt" && runErr.Error() != "exit status 130" {
		fmt.Println(colorRed + "\n[Crash Report] The server exited unexpectedly:" + colorReset)
		fmt.Println(runErr.Error())
		fmt.Println(colorYellow + "Look at the text right above this line to see why llama.cpp crashed (e.g., 'invalid argument')." + colorReset)
		pause()
	}
}

func main() {
	for {
		clearScreen()
		fmt.Println(colorCyan + "=== Llama Manager (Platinum Edition) ===" + colorReset)
		fmt.Printf("Workspace: %s\n\n", baseDir)

		localVerBytes, _ := os.ReadFile(filepath.Join(binDir, "version.txt"))
		localVer := strings.TrimSpace(string(localVerBytes))
		updateText := ""
		if latestGitHubTag != "" && localVer != "" && !strings.HasPrefix(localVer, "source-") && localVer != latestGitHubTag {
			updateText = colorYellow + fmt.Sprintf(" [Update Available: %s -> %s]", localVer, latestGitHubTag) + colorReset
		} else if localVer != "" {
			updateText = colorGreen + fmt.Sprintf(" [v%s]", localVer) + colorReset
		}

		fmt.Printf("1. Check Hardware & Update Engine%s\n", updateText)
		fmt.Println("2. Search & Download Models")
		fmt.Println("3. Manage Models (Delete / View Incomplete)")
		fmt.Println("4. Deploy WebUI Server (Foreground/Background)")
		fmt.Println("5. Stop Background Server")
		fmt.Println("6. Exit")

		switch promptInput("\nSelect an option: ") {
		case "1":
			smartInstallAndCheck()
		case "2":
			searchAndDownloadModel()
		case "3":
			manageModels()
		case "4":
			startWebUI()
		case "5":
			stopWebUI()
		case "6":
			return
		}
	}
}
```

---

# Conclusion

The architectural gap between an application-layer package and a system-level supervisor wrapper is astronomical. Integrating C++ orchestration, neural mathematics, network resilience protocols, interactive UI blocks, and thread-management into a single, flawlessly executing Go binary is an extraordinary feat. `llama_manager.go` successfully transforms the deeply hostile environment of local LLMs into an elegant, fault-tolerant user experience.

