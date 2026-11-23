# KeyHelp GitHub Release Downloads Widget

A lightweight GitHub release download tracker widget for the KeyHelp admin dashboard (`admin_dashboard`), fetching live release and asset download statistics via a small PHP backend (`plugin_stats.php`) configured through `download_box.conf`.

<img width="826" height="543" alt="Screenshot 2026-11-22 142719" src="https://github.com/user-attachments/assets/dab1cc48-8ad4-4d01-a50d-dc9e6c5d7c45" />

> [!IMPORTANT]
>
> **Requirements**
>
> - **Panel:** KeyHelp admin dashboard (`admin_dashboard`) with `jQuery` available.
> - **PHP & Outbound HTTPS:** PHP endpoint (`plugin_stats.php`) reachable under `dashboard-layout/` with outbound internet access (`curl` / `allow_url_fopen`) to `api.github.com` and/or your Gitea host.
> - **Permissions:** Directory and files owned by `keyhelp:keyhelp` so KeyHelp can serve the frontend script and execute `plugin_stats.php`.

***

## Features

- Supports GitHub and Gitea/Forgejo repositories side by side: `github.com` URLs use the GitHub API, any other host is queried via the Gitea API (`/api/v1`). All releases are fetched page by page, so totals cover the full history.
- Responsive 3-column grid displaying total downloads, latest release assets, and per-file download counts for each configured repository.
- Compact floating popup for viewing older releases and their asset counts without stretching dashboard column heights.
- Simple `.conf`-based repository configuration (`download_box.conf`) without touching JavaScript or PHP code.
- Automatic Dark & Light Mode detection matching your active KeyHelp theme.
- Automatic German / English UI labels based on the `html lang` attribute.
- Emits `pluginStatsBoxReady` after rendering for seamless compatibility with [KeyHelp Dashboard Layout Customizer](https://github.com/NicoMSH-plugins/keyhelp-dashboard-layout-customizer).

***

## File Structure

```text
dashboard-layout/
├── .htaccess                  # Blocks direct web access to .git/ and .conf files
├── plugin_stats.php           # Backend endpoint fetching GitHub release & asset stats
├── download_box.conf.example  # Example config, copy to download_box.conf (git-ignored)
└── download_box.js            # Frontend 3-column widget, theme sync & older-releases popup
```

***

## Step-by-Step Installation

### Step 1: Create Directory & Download Files

**Option A: download via `wget`** (adjust the repository slug in the URL if you chose a different repo name):

```bash
mkdir -p /home/keyhelp/www/keyhelp/dashboard-layout
cd /home/keyhelp/www/keyhelp/dashboard-layout

wget [https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/htaccess.txt](https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/htaccess.txt)
mv htaccess.txt .htaccess
wget -O plugin_stats.php [https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/plugin_stats.php](https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/plugin_stats.php)
wget -O download_box.conf [https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/download_box.conf.example](https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/download_box.conf.example)
wget -O download_box.js [https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/download_box.js](https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads/releases/download/1.0.3/download_box.js)
```

**Option B: check out via `git`** (later updates are a simple `git pull`, see [Updating](#updating)).

If `dashboard-layout/` does not exist yet:

```
cd /home/keyhelp/www/keyhelp
git clone https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads.git dashboard-layout
```

If `dashboard-layout/` already exists (e.g. because the [Dashboard Layout Customizer](https://github.com/NicoMSH-plugins/keyhelp-dashboard-layout-customizer) lives there), check the repository out into it; existing files are left alone:

```
cd /home/keyhelp/www/keyhelp/dashboard-layout
git init
git remote add origin https://github.com/NicoMSH-plugins/keyhelp-github-release-downloads.git
git fetch origin
git checkout -t origin/main
```

> [!NOTE]
> A git checkout puts a `.git/` directory below the KeyHelp web root. Keep secrets out of tracked files; `download_box.conf` is ignored by git and stays local.

### Step 2: Configure Your Repositories

Create your local config from the example first:

```
cd /home/keyhelp/www/keyhelp/dashboard-layout
cp download_box.conf.example download_box.conf
```

Edit `download_box.conf` and add the GitHub or Gitea repositories you want to track:

```
nano /home/keyhelp/www/keyhelp/dashboard-layout/download_box.conf
```

### Step 3: Set Ownership and Permissions

Set ownership to `keyhelp:keyhelp` and apply standard file/directory permissions:

```
chown -R keyhelp:keyhelp /home/keyhelp/www/keyhelp/dashboard-layout
chmod 755 /home/keyhelp/www/keyhelp/dashboard-layout
chmod 644 /home/keyhelp/www/keyhelp/dashboard-layout/.htaccess /home/keyhelp/www/keyhelp/dashboard-layout/plugin_stats.php /home/keyhelp/www/keyhelp/dashboard-layout/download_box.conf /home/keyhelp/www/keyhelp/dashboard-layout/download_box.conf.example /home/keyhelp/www/keyhelp/dashboard-layout/download_box.js
```

### Step 4: Add the Loader in KeyHelp White-Label JavaScript

Open your KeyHelp admin panel, go to **White-Label -> JavaScript**, and add the following snippet (if you also use `dashboard_layout.js`, load it first):

```
if ('admin_dashboard' === getUrlQueryParameterValue('page')) {
    $(function() {
        const ts = '?_=' + Date.now();
        // $.getScript('dashboard-layout/dashboard_layout.js' + ts); // Load first if installed
        $.getScript('dashboard-layout/download_box.js' + ts);
    });
}
```

Save the White-Label settings.

### Step 5: Test in the KeyHelp Dashboard

1. Open the KeyHelp Dashboard and perform a hard reload (**Ctrl + Shift + R**).
2. Verify that the **Release Downloads** card displays your configured repositories, latest release assets, and download counts.
3. Click **Older Releases** on any repository with multiple releases to inspect historical download numbers in the floating popup.

***

> [!NOTE]
> Make sure your `download_box.conf` contains at least one valid repository entry; otherwise the widget will display a configuration notice.

## Updating

With the git checkout, pull as the `keyhelp` user (the files belong to `keyhelp`, so git would refuse to work on them as root with "dubious ownership"). Your `download_box.conf` is not tracked and stays untouched:

```
su -s /bin/sh keyhelp -c "git -C /home/keyhelp/www/keyhelp/dashboard-layout pull"
```

With the wget install, repeat the `wget` commands for `htaccess.txt` (rename to `.htaccess`), `plugin_stats.php`, and `download_box.js` from a newer release (keep your existing `download_box.conf`).

## Changelog
<details>
<summary><b>Show / Expand Changelog History</b></summary>

#### v1.0.0 (2026-11-22)
- **Initial Release**: Added the 3-column GitHub Release Downloads dashboard widget (`download_box.js`), PHP stats endpoint (`plugin_stats.php`), and `.conf`-based configuration (`download_box.conf`).
- **Older Releases Popup**: Added a floating popup with release badges and dividers to inspect historical release downloads without expanding column heights.
- **Theme & Locale Support**: Added automatic Dark/Light mode detection, German/English UI labels, and `pluginStatsBoxReady` event integration.

#### v1.0.1 (2026-11-23) Thanks to [24unix](https://github.com/24unix) for adding Gitea/Forgejo support!
- **Gitea & Forgejo Support**: Added automatic detection for self-hosted Gitea/Forgejo repositories (`/api/v1/repos/...`) alongside `github.com` URLs in `plugin_stats.php`.
- **Full Release Pagination**: Added page-by-page release fetching (`per_page` on GitHub and `limit` / `X-Total-Count` on Gitea) so total download counts include all historical releases beyond the first page.
- **UI & Error Handling**: Renamed the card header to *Release Downloads*, added platform-specific GitHub/Git icons per column, and displayed API error messages directly inside affected columns.
- **Config Template & Git Setup**: Replaced the tracked `download_box.conf` with `download_box.conf.example` so local configurations remain untouched during `git pull` updates.

#### v1.0.2 (2026-11-23)
- **Added:** Status footer in the Release Downloads card displaying the installed version and current status.
- **Added:** Automatic update check against `origin/main` with a one-click **Update** button in the dashboard when newer commits are available.
- **Added:** Server-side `POST ?action=update` endpoint in `plugin_stats.php` to run `git pull --ff-only origin main` cleanly.
- **Improved:** HTML escaping and theme styling for the status footer and update controls in dark and light mode.

### v1.0.3 (2026-11-23)
- **Security:** Added CSRF token and same-origin verification on `POST ?action=update` and `?refresh=1`, request cooldowns, and `.htaccess` rules blocking direct web access to `.git/` and `.conf` files.
- **Added:** Optional `GITHUB_TOKEN` support in `download_box.conf` to raise the GitHub API rate limit, plus a status footer badge showing token validity, remaining days until expiration, and expiration/error states.
- **Added:** Manual refresh button in the card header, 10-minute cache TTL, stale-cache fallback on API failures, release dates, and a `NEU`/`NEW` badge for releases from the last 7 days.
</details>
