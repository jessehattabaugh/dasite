# DaSite

The website testing tool that vibes with your development process.

## Purpose

You know you wanna test the site; it's the first thing you want to do after every feature you implement. You want to know that the site works, and how well. You want to know if the site looks different than it did and how much, and where. You want to make sure that core page speed metrics are getting better, not worse over time. You want to make sure the site stays accessibile. You want to watch your site grow from a single page, you many with an album of screenshots along the way.You want all that to happen as fast as possible so you can push your changes and get on with the next feature. In fact, sometimes you just want to test one page at a time, or a glob of pages. You want it tested with a real browser, chrome, firefox, and webkit, and you want it tested at different screen resolutions. You don't have time to mess around with complex configuration, or writing bespoke test specs.

DaSite does all of this right from the command line.

```bash
npx dasite http://dasite.github.io
```

## Roadmap

1. **Screenshot a page:** Dasite will visit the url you provided, load the page, save a screenshot of the page
2. **Crawl the site:** Dasite will crawl the page for other urls on the same domain, and recursively visit and screenshot them as well
3. **Compare screenshots to previous:** Dasite will compare previous screenshots to current screenshots, and report which ones have changed, how much, and in what places. It will create a diff image with highlighted pixels where the screen
4. **Fail at threshold:** Exit with failure if the changes exceed a user definable threshold
5. **Performance Tests:** capture lighthouse performance metrics for the pages, these are stored as JSON. The values are diffed and a new JSON file representing the diff is created
6. **Accessibility Tests:** do an accessibility audit and store the metrics in a diffable JSON format
7. **Security Tests:** do a security audit and diff that as well
