---
title: Content Submission Form
date: 2023-10-29
draft: false
---
<head>
    <h2>Content Submission Form</h2>
    <style>
      body {
            margin: 0;
            padding: 0;
        }
      h1 {
            text-align: center;
        }
      #content-form {
            padding: 20px;
            border-radius: 5px;
        }
      label {
            display: block;
            margin: 10px 0;
            font-weight: bold;
        }
      select,
        input[type="text"],
        input[type="number"],
        textarea {
            width: 100%;
            padding: 10px;
            margin: 5px 0;
            border: 1px solid #ccc;
            border-radius: 5px;
        }
      .content-section {
            display: none;
        }
.fancy-button {
    display: block; /* Make the button a block-level element */
    margin: 0 auto; /* Center the button horizontally */
    background-color: #4CAF50; /* Background color */
    color: white; /* Text color */
    border: none; /* Remove border */
    padding: 10px 20px; /* Padding */
    text-align: center; /* Center text horizontally */
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    border-radius: 5px; /* Rounded corners */
    cursor: pointer;
    transition: background-color 0.3s; /* Smooth color transition on hover */
}
.fancy-button:hover {
    background-color: #45a049; /* Darker color on hover */
}
        .file-input {
    margin-bottom: 10px; /* Adjust as needed for spacing */
    position: relative;
}
/* Hide the default file input */
.file-input input[type="file"] {
    display: none;
}
.file-input .custom-file-label {
    border: 1px solid #ccc; /* Border style */
    padding: 10px; /* Adjust as needed for padding */
    display: block;
    cursor: pointer;
}
.file-input .custom-file-label:hover {
    background-color: #e0e0e0; /* Adjust as needed */
}
.file-input input[type="file"]:valid + .custom-file-label::after {
    content: "Selected: " attr(data-file-name);
    display: inline-block;
    margin-left: 10px;
}
.file-input input[type="file"]:valid + .custom-file-label::before {
    content: "Browse";
}
    </style>
</head>
<body>
    <h1>Submit Content</h1>
    <form id="content-form" action="your-submission-endpoint" method="post">
        <label for="content_type">Select Content Type:</label>
        <select id="content_type" name="content_type" required>
            <option value="news">News</option>
            <option value="learn">Learn</option>
            <option value="events">Events</option>
            <option value="casts">Casts</option>
            <option value="jobs">Jobs</option>
        </select>

<div id="news" class="content-section">
   <label for="title">Title:</label>
  <input type="text" id="news-title" name="news-title" required>

  <label for="author">Author:</label>
  <input type="text" id="news-author" name="news-author" required>

  <label for="cover">Cover:</label>
  <input type="file" id="news-cover" name="news-cover" accept="image/*" required>

  <label for="categories">Categories (comma-separated):</label>
  <input type="text" id="news-categories" name="news-categories" required>

  <label for="tags">Tags (comma-separated):</label>
  <input type="text" id="news-tags" name="news-tags" required>

<label for="body">Body (Markdown):</label>
<textarea id="news-body" name="news-body" required></textarea>

</div>
<div id="learn" class="content-section">
  <label for="authors">Authors:</label>
  <input type="text" id="learn-authors" name="learn-authors">

<label for="body">Body (Markdown):</label>
<textarea id="learn-body" name="learn-body" required></textarea>

  <label for="license">License:</label>
  <input type="text" id="learn-license" name="learn-license">

  <label for="images">Images:</label>
  <input type="file" id="learn-images" name="learn-images" accept="image/*" multiple>

  <label for="tags">Tags:</label>
  <input type="text" id="learn-tags" name="learn-tags">

  <label for="categories">Categories:</label>
  <input type="text" id="learn-categories" name="learn-categories">

  <label for="series">Series:</label>
  <input type="text" id="learn-series" name="learn-series">


<div class="file-input">
        <label for="featuredImage" class="custom-file-label">Featured Image</label>
        <input type="file" id="learn-featuredImage" name="learn-featuredImage" accept="image/*">
    </div>
    <div class="file-input">
        <label for="featuredImagePreview" class="custom-file-label">Featured Image Preview</label>
        <input type="file" id="learn-featuredImagePreview" name="learn-featuredImagePreview" accept="image/*">
    </div>

  <label for="twemoji">Twemoji:</label>
  <input type="checkbox" id="learn-twemoji" name="learn-twemoji">

  <label for="lightgallery">LightGallery:</label>
  <input type="checkbox" id="learn-lightgallery" name="learn-lightgallery">

  <label for="ruby">Ruby:</label>
  <input type="checkbox" id="learn-ruby" name="learn-ruby">

  <label for="fraction">Fraction:</label>
  <input type="checkbox" id="learn-fraction" name="learn-fraction">

  <label for="fontawesome">FontAwesome:</label>
  <input type="checkbox" id="learn-fontawesome" name="learn-fontawesome">

  <label for="code">Code:</label>
  <input type="file" id="learn-code" name="learn-code" accept=".zip,application/zip,application/x-zip,application/x-zip-compressed" multiple>

  <label for="table">Table:</label>
  <input type="checkbox" id="learn-table" name="learn-table">

  <label for="math">Math:</label>
  <input type="checkbox" id="learn-math" name="learn-math">

  <label for="mapbox">Mapbox:</label>
  <input type="text" id="learn-mapbox" name="learn-mapbox">

  <label for="comment">Comment:</label>
  <input type="checkbox" id="learn-comment" name="learn-comment">

  <label for="library">Library:</label>
  <input type="text" id="learn-library" name="learn-library">

  <label for="seo">SEO:</label>
  <input type="text" id="learn-seo" name="learn-seo">
</div>
<div id="events" class="content-section">
  <label for="title">Title:</label>
    <input type="text" id="events-title" name="events-title" required>
    <label for="date">Date: (Use Calender Icon to pick date, and manually click to enter time)</label>
    <input type="datetime-local" id="events-date" name="events-date" required>
    <label for="location">Location:</label>
    <input type="text" id="events-location" name="events-location">
    <div class="file-input">
        <label for="featuredImage" class="custom-file-label">Featured Image</label>
        <input type="file" id="events-featuredImage" name="events-featuredImage" accept="image/*">
    </div>
    <div class="file-input">
        <label for="featuredImagePreview" class="custom-file-label">Featured Image Preview</label>
        <input type="file" id="events-featuredImagePreview" name="events-featuredImagePreview" accept="image/*">
    </div>
    <label for="body">Body (Markdown):</label>
    <textarea id="events-body" name="events-body" required></textarea>
    <label for="organizer">Organizer:</label>
    <input type="text" id="events-organizer" name="events-organizer">
    <label for="website">Website:</label>
    <input type="text" id="events-website" name="events-website">
    <label for="registrationLink">Registration Link:</label>
    <input type="text" id="events-registrationLink" name="events-registrationLink">
  </div>
<div id="casts" class="content-section">
   <label for="title">Title:</label>
  <input type="text" id="casts-title" name="casts-title" required>

  <label for="hosts">Hosts (comma-separated):</label>
  <input type="text" id="casts-hosts" name="casts-hosts">

<label for="body">Body (Markdown):</label>
<textarea id="casts-body" name="casts-body" required></textarea>
  <label for="language">Language:</label>
  <input type="text" id="casts-language" name="casts-language">

  <label for="category">Category:</label>
  <select id="casts-category" name="casts-category">
    <option value="Web Development">Web Development</option>
    <option value="System Programming">System Programming</option>
    <option value="Networking">Networking</option>
    <option value="Cloud Services">Cloud Services</option>
    <option value="DevOps">DevOps</option>
    <option value="Container Orchestration">Container Orchestration</option>
    <option value="Blockchain">Blockchain</option>
    <option value="Database Systems">Database Systems</option>
    <option value="Game Development">Game Development</option>
    <option value="Data Analysis">Data Analysis</option>
    <option value="Internet of Things (IoT)">Internet of Things (IoT)</option>
    <option value="Command-Line Tools">Command-Line Tools</option>
    <option value="Security Tools">Security Tools</option>
    <option value="Multimedia and Graphics">Multimedia and Graphics</option>
    <option value="Embedded Systems">Embedded Systems</option>
    <option value="Other">Other</option>
  </select>

  <label for="episodeCount">Episode Count:</label>
  <input type="number" id="casts-episodeCount" name="casts-episodeCount">

  <label for="link">Link:</label>
  <input type="text" id="casts-link" name="casts-link">

  <div class="file-input">
        <label for="featuredImage" class="custom-file-label">Featured Image</label>
        <input type="file" id="casts-featuredImage" name="casts-featuredImage" accept="image/*">
    </div>
    <div class="file-input">
        <label for="featuredImagePreview" class="custom-file-label">Featured Image Preview</label>
        <input type="file" id="casts-featuredImagePreview" name="casts-featuredImagePreview" accept="image/*">
    </div>

  <label for="hiddenFromHomepage">Hidden from Homepage:</label>
  <input type="checkbox" id="casts-hiddenFromHomepage" name="casts-hiddenFromHomepage">

  <label for="hiddenFromSearch">Hidden from Search:</label>
  <input type="checkbox" id="casts-hiddenFromSearch" name="casts-hiddenFromSearch">
  </div>
<div id="jobs" class="content-section">
  <label for="title">Title:</label>
  <input type="text" id="jobs-title" name="jobs-title" required>

  <label for="type">Type:</label>
  <select id="jobs-type" name="jobs-type">
    <option value="Full-time">Full-time</option>
    <option value="Part-time">Part-time</option>
    <option value="Contract">Contract</option>
    <option value="One-time">One-time</option>
  </select>

  <label for="compensation">Compensation:</label>
  <select id="jobs-compensation" name="jobs-compensation">
    <option value="Unpaid/Volunteered">Unpaid/Volunteered</option>
    <option value="Equity Only">Equity Only</option>
    <option value="Salary">Salary</option>
    <option value="Salary + Equity">Salary + Equity</option>
  </select>

  <label for="salaryAmount">Salary Amount:</label>
  <input type="number" id="jobs-salaryAmount" name="jobs-salaryAmount">

  <label for="salaryFrequency">Salary Frequency:</label>
  <select id="jobs-salaryFrequency" name="jobs-salaryFrequency">
    <option value="Annual">Annual</option>
    <option value="Monthly">Monthly</option>
    <option value="Daily">Daily</option>
    <option value="Hourly">Hourly</option>
  </select>

  <label for="location">Location:</label>
  <input type="text" id="jobs-location" name="jobs-location">

<label for="body">Body (Markdown):</label>
<textarea id="jobs-body" name="jobs-body" required></textarea>
  <label for="company">Company:</label>
  <input type="text" id="jobs-company" name="jobs-company">

  <label for="companyWebsite">Company Website:</label>
  <input type="text" id="jobs-companyWebsite" name="jobs-companyWebsite">

  <label for="applicationLink">Application Link:</label>
  <input type="text" id="jobs-applicationLink" name="jobs-applicationLink">

<div class="file-input">
        <label for="featuredImage" class="custom-file-label">Featured Image</label>
        <input type="file" id="jobs-featuredImage" name="jobs-featuredImage" accept="image/*">
    </div>
    <div class="file-input">
        <label for="featuredImagePreview" class="custom-file-label">Featured Image Preview</label>
        <input type="file" id="jobs-featuredImagePreview" name="jobs-featuredImagePreview" accept="image/*">
    </div>

  <label for="hiddenFromHomepage">Hidden from Homepage:</label>
  <input type="checkbox" id="jobs-hiddenFromHomepage" name="jobs-hiddenFromHomepage">

  <label for="hiddenFromSearch">Hidden from Search:</label>
  <input type="checkbox" id="jobs-hiddenFromSearch" name="jobs-hiddenFromSearch">
</div>
<button id="submit-button" type="submit" class="fancy-button">Submit</button>
    </form>
    <script>
        function showFields(contentType) {
            // Hide all content sections
            document.querySelectorAll('.content-section').forEach(function (el) {
                el.style.display = 'none';
            });
            // Show the content section based on selected content type
            if (contentType) {
                document.getElementById(contentType).style.display = 'block';
            }
        }
        showFields(document.getElementById('content_type').value);
        document.getElementById('content_type').addEventListener('change', function () {
            showFields(this.value);
        });
    </script>
<script>
    document.getElementById('submit-button').addEventListener('click', function (event) {
        event.preventDefault(); // Prevent the default form submission
        const contentType = document.getElementById('content_type').value;
        // Use the main form element with the id="content-form"
        const formElement = document.getElementById('content-form');
        if (formElement) {
            const formData = new FormData(formElement);
            // Filter the form data to include only fields related to the selected content type
            const filteredData = new FormData();
            for (const [name, value] of formData.entries()) {
                if (name.startsWith(`${contentType}-`)) {
                    filteredData.append(name, value);
                }
            }
            // Display the filtered form data (you can customize this part)
            for (const [name, value] of filteredData.entries()) {
                console.log(`${name}: ${value}`);
            }
            // Send a POST request to the server-side endpoint using the fetch API
            fetch('http://localhost:8080/submit-form', {
                method: 'POST',
                body: filteredData
            })
            .then(response => {
                if (response.ok) {
                    // Form submitted successfully
                    console.log('Form submitted successfully.');
                } else {
                    console.error('Form submission failed.');
                }
            });
        } else {
            console.error('Form element not found.');
        }
    });
</script>
</body>