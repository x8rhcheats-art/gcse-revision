@echo off
rem One-time Cloudflare login for this laptop, so deploy.bat can publish the
rem hosted phone copy. A browser tab opens - log in and click Allow.
cd /d "%~dp0tools"
call node_modules\.bin\wrangler.cmd login
pause
