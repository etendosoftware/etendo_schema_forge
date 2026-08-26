# Document report branding

The official grid **Print** action renders `print-*` document reports through
`tools/app-shell/vite-plugins/report-api.js`. Each report keeps its own business
content in `artifacts/<report>/template.hbs`, while shared branding is provided
by `templates/reports/document-branding.hbs`.

Document report header SQL should expose the organization's
`Your_Company_Document_Image` as `org_logo_id`, or rely on the report API's
legacy `org`-alias fallback. The report API fetches the image through the
authenticated NEO image endpoint and embeds it as `header.companyLogoDataUrl`.
If the logo is unavailable, the report remains printable without an image.

To add the standard branding to a new document template, place this partial
inside the company/header block:

```hbs
{{> document-branding}}
```

The partial is expanded before both local HTML rendering and jsreport PDF
rendering, so the two outputs stay aligned. Future report-specific branding
can evolve the partial or add contract-level options without duplicating image
fetching and authentication logic in every report.
