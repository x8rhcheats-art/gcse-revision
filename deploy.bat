@echo off
rem Publish the current site/ folder to the private Cloudflare Pages URL.
rem Run this after any content change so the phone copy stays current.
rem
rem Uses the locally installed wrangler rather than npx: npx re-resolves its
rem dependencies every run, and that has failed on a bad upstream package.
cd /d "%~dp0"
call tools\node_modules\.bin\wrangler pages deploy site --project-name=quiet-harbour-k7m3q --branch=main --commit-dirty=true
pause
