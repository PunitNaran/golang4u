package main

import (
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/didip/tollbooth"
	"github.com/didip/tollbooth/limiter"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()
	// Configure CORS middleware to allow requests from your frontend domain
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:1313"},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept},
	}))
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	limiter := tollbooth.NewLimiter(1,
		&limiter.ExpirableOptions{DefaultExpirationTTL: time.Minute, ExpireJobInterval: 30 * time.Second},
	)

	// Limit request body size to 5MB (5 * 1024 * 1024 bytes)
	e.Use(middleware.BodyLimit("5M"))

	e.Use(scanMalwareMiddleware)
	// Convert the tollbooth.LimitHandler to an echo.MiddlewareFunc
	tollboothMiddleware := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := tollbooth.LimitByRequest(limiter, c.Response(), c.Request())
			if err != nil {
				return c.String(http.StatusTooManyRequests, "Rate limit exceeded")
			}
			return next(c)
		}
	}
	// Define your routes
	e.POST("/submit-form", handleFormSubmission, tollboothMiddleware)

	// Start the server
	e.Start(":8080")
}

func scanMalwareMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Check if the request is a POST request
		if c.Request().Method == http.MethodPost {
			// Access the POST data or uploaded files here

			// Run ClamAV antivirus scan
			isInfected, err := scanWithClamAV(c.Request().Body)

			if err != nil {
				return c.String(http.StatusInternalServerError, "Error scanning for malware")
			}

			if isInfected {
				return c.String(http.StatusForbidden, "Malware detected")
			}
		}

		return next(c)
	}
}

func scanWithClamAV(data io.ReadCloser) (bool, error) {
	cmd := exec.Command("clamscan", "--fdpass", "-")
	b, err := io.ReadAll(data)
	if err != nil {
		return false, err
	}
	cmd.Stdin = strings.NewReader(string(b))

	output, err := cmd.CombinedOutput()

	if err != nil {
		return false, err
	}

	return strings.Contains(string(output), "FOUND"), nil
}

type NewsFormData struct {
	NewsTitle      string `form:"news-title"`
	NewsAuthor     string `form:"news-author"`
	NewsCover      []byte `form:"news-cover"` // Assuming you want to store the binary data of the uploaded image
	NewsCategories string `form:"news-categories"`
	NewsTags       string `form:"news-tags"`
	NewsBody       string `form:"news-body"`
}

type LearnFormData struct {
	LearnTitle                string `form:"learn-title"`
	LearnSubtitle             string `form:"learn-subtitle"`
	LearnAuthors              string `form:"learn-authors"`
	LearnBody                 string `form:"learn-body"`
	LearnLicense              string `form:"learn-license"`
	LearnImages               []byte `form:"learn-images"` // Assuming you want to store the binary data of uploaded images
	LearnTags                 string `form:"learn-tags"`
	LearnCategories           string `form:"learn-categories"`
	LearnSeries               string `form:"learn-series"`
	LearnSeriesWeight         string `form:"learn-seriesWeight"`
	LearnSeriesNavigation     string `form:"learn-seriesNavigation"`
	LearnFeaturedImage        []byte `form:"learn-featuredImage"`        // Binary data of featured image
	LearnFeaturedImagePreview []byte `form:"learn-featuredImagePreview"` // Binary data of featured image preview
	LearnTwemoji              bool   `form:"learn-twemoji"`
	LearnLightGallery         bool   `form:"learn-lightgallery"`
	LearnRuby                 bool   `form:"learn-ruby"`
	LearnFraction             bool   `form:"learn-fraction"`
	LearnFontAwesome          bool   `form:"learn-fontawesome"`
	LearnCode                 []byte `form:"learn-code"` // Assuming you want to store the binary data of uploaded code files
	LearnTable                bool   `form:"learn-table"`
	LearnMath                 bool   `form:"learn-math"`
	LearnMapbox               string `form:"learn-mapbox"`
	LearnComment              bool   `form:"learn-comment"`
	LearnLibrary              string `form:"learn-library"`
	LearnSEO                  string `form:"learn-seo"`
}

type EventsFormData struct {
	EventsTitle                string    `form:"events-title"`
	EventsDate                 time.Time `form:"events-date"`
	Eventsauthors              string    `form:"events-authors"`
	EventsLocation             string    `form:"events-location"`
	EventsFeaturedImage        []byte    `form:"events-featuredImage"`        // Binary data of featured image
	EventsFeaturedImagePreview []byte    `form:"events-featuredImagePreview"` // Binary data of featured image preview
	EventsBody                 string    `form:"events-body"`
	EventsOrganizer            string    `form:"events-organizer"`
	EventsWebsite              string    `form:"events-website"`
	EventsRegistrationLink     string    `form:"events-registrationLink"`
}

type CastsFormData struct {
	CastsTitle                string `form:"casts-title"`
	CastsHosts                string `form:"casts-hosts"`
	CastsSubtitle             string `form:"casts-subtitle"`
	CastsAuther               string `form:"casts-authors"`
	CastsBody                 string `form:"casts-body"`
	CastsLanguage             string `form:"casts-language"`
	CastsCategory             string `form:"casts-category"`
	CastsEpisodeCount         int    `form:"casts-episodeCount"`
	CastsLink                 string `form:"casts-link"`
	CastsFeaturedImage        []byte `form:"casts-featuredImage"`        // Binary data of featured image
	CastsFeaturedImagePreview []byte `form:"casts-featuredImagePreview"` // Binary data of featured image preview
	CastsHiddenFromHomepage   bool   `form:"casts-hiddenFromHomepage"`
	CastsHiddenFromSearch     bool   `form:"casts-hiddenFromSearch"`
}

type JobsFormData struct {
	JobsTitle                string `form:"jobs-title"`
	JobsType                 string `form:"jobs-type"`
	JobsCompensation         string `form:"jobs-compensation"`
	JobsSalaryAmount         int    `form:"jobs-salaryAmount"`
	JobsSalaryFrequency      string `form:"jobs-salaryFrequency"`
	JobsLocation             string `form:"jobs-location"`
	JobsBody                 string `form:"jobs-body"`
	JobsCompany              string `form:"jobs-company"`
	JobsCompanyWebsite       string `form:"jobs-companyWebsite"`
	JobsApplicationLink      string `form:"jobs-applicationLink"`
	JobsFeaturedImage        []byte `form:"jobs-featuredImage"`        // Binary data of featured image
	JobsFeaturedImagePreview []byte `form:"jobs-featuredImagePreview"` // Binary data of featured image preview
	JobsHiddenFromHomepage   bool   `form:"jobs-hiddenFromHomepage"`
	JobsHiddenFromSearch     bool   `form:"jobs-hiddenFromSearch"`
}

// Define a handler for form submissions
func handleFormSubmission(c echo.Context) error {
	// Parse the form data and check the content type
	contentType := c.FormValue("content_type")
	data := ""
	switch contentType {
	case "news":
		newsData := new(NewsFormData)
		if err := c.Bind(newsData); err != nil {
			return err
		}
		data = newsData.createNewsMarkdownTemplate()

	case "learn":
		learnData := new(LearnFormData)
		if err := c.Bind(learnData); err != nil {
			return err
		}
		data = learnData.createLearnMarkdownTemplate()

	case "events":
		eventsData := new(EventsFormData)
		if err := c.Bind(eventsData); err != nil {
			return err
		}
		data = eventsData.createEventsMarkdownTemplate()

	case "jobs":
		jobsData := new(JobsFormData)
		if err := c.Bind(jobsData); err != nil {
			return err
		}
		data = jobsData.createJobsMarkdownTemplate()

	case "casts":
		castsData := new(CastsFormData)
		if err := c.Bind(castsData); err != nil {
			return err
		}
		data = castsData.createCastsMarkdownTemplate()

	default:
		return c.JSON(http.StatusBadRequest, "Invalid content type")
	}

	// Now you can process the form data and create a Markdown file based on the content type
	// Handle data here...
	_ = data
	// Send the Access-Control-Allow-Origin header to allow cross-origin requests
	c.Response().Header().Set("Access-Control-Allow-Origin", "http://localhost:1313")

	return c.JSON(http.StatusOK, "Form submitted successfully")
}

func (learn *LearnFormData) createLearnMarkdownTemplate() string {
	template := `
---
title: "%s"
date: %s
lastmod: %s
subtitle: "%s"
draft: true
authors: "%s"
license: "%s"
categories: "%s"
tags: "%s"
series: "%s"
seriesWeight: "%s"
seriesNavigation: "%s"
hiddenFromHomePage: false
hiddenFromSearch: false
linkToMarkdown: false
linkToSource: false
linkToEdit: false
linkToReport: false
rssFullText: false
toc: false
twemoji: %v
lightgallery: %v
ruby: %v
fraction: %v
fontawesome: %v
code: false
share: false
table: %v
math: %v
mapbox: "%s"
comment: %v
library: "%s"
seo: "%s"
outdatedArticleReminder: false
---
%s
`
	date := time.Now().Format("2006-01-02T15:04:05Z")
	return fmt.Sprintf(template, date, date, learn.LearnTitle, learn.LearnSubtitle, learn.LearnAuthors, learn.LearnLicense, learn.LearnCategories, learn.LearnTags,
		learn.LearnSeries, learn.LearnSeriesWeight, learn.LearnSeriesNavigation, learn.LearnTwemoji, learn.LearnLightGallery, learn.LearnRuby, learn.LearnFraction,
		learn.LearnFontAwesome, learn.LearnCode, learn.LearnTable, learn.LearnMath, learn.LearnMapbox,
		learn.LearnComment, learn.LearnLibrary, learn.LearnSEO, learn.LearnBody)
}

func (jobs *JobsFormData) createJobsMarkdownTemplate() string {
	template := `
---
title: "%s"
draft: true
description: "%s"
company: "%s"
compensation: "%s"
type: "%s"
location: "%s"
salaryFrequency: "%s"
hiddenFromHomePage: false
hiddenFromSearch: false
location: "%s"
companyWebsite: "%s"
salaryAmount: %d
applicationLink: "%s"
---
%s

`
	return fmt.Sprintf(template, jobs.JobsTitle, jobs.JobsType, jobs.JobsCompany, jobs.JobsCompensation, jobs.JobsType,
		jobs.JobsLocation, jobs.JobsSalaryFrequency, jobs.JobsLocation, jobs.JobsCompanyWebsite, jobs.JobsSalaryAmount, jobs.JobsSalaryFrequency, jobs.JobsApplicationLink, jobs.JobsBody)
}

func (casts *CastsFormData) createCastsMarkdownTemplate() string {
	template := `
---
title: "%s"
draft: true
hosts: "%s"
subtitle: "%s"
language: "%s"
category: "%s"
episodeCount: %d
link: "%s"
featuredImage: ""
featuredImagePreview: ""
hiddenFromHomepage: false
hiddenFromSearch: false
---
%s
`
	return fmt.Sprintf(template, casts.CastsTitle, casts.CastsHosts, casts.CastsSubtitle, casts.CastsLanguage,
		casts.CastsCategory, casts.CastsEpisodeCount, casts.CastsLink,
		casts.CastsBody)
}

func (events *EventsFormData) createEventsMarkdownTemplate() string {
	template := `
---
title: "%s"
draft: true
date: %s
authors: "%s"
location: "%s"
featuredImage: ""
featuredImagePreview: ""
organizer: %s
website: %s
registrationLink: %s
---
%s
`
	date := time.Now().Format("2006-01-02T15:04:05Z")
	return fmt.Sprintf(template, events.EventsTitle, date, events.Eventsauthors,
		events.EventsLocation, events.EventsOrganizer, events.EventsWebsite, events.EventsRegistrationLink, events.EventsBody)
}

func (news *NewsFormData) createNewsMarkdownTemplate() string {
	template := `
---
title: "%s"
date: %s
lastmod: %s
draft: true
authors: "%s"
categories: "%s"
tags: "%s"
cover: "%s"
---
%s
`
	date := time.Now().Format("2006-01-02T15:04:05Z")
	return fmt.Sprintf(template, news.NewsTitle, date, date, news.NewsAuthor, news.NewsCategories, news.NewsTags, news.NewsCover, news.NewsBody)
}
