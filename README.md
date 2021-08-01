# open-sauced/actions
This is a collection of actions that power various features within Open Sauced. 

## opensauced-admin
This action is powered by the OPEN_SAUCED_APP_ID (installed on all goal repos) and updates the contents of the data.json files with the newest data every Wednesday and Saturday. 

**example usage:**
```yml
jobs:
  admin-sauce:
    name: run update
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
      with:
        node-version: 16
    - name: Cache node modules
      uses: actions/cache@v2
      env:
        cache-name: cache-node-modules
      with:
        # npm cache files are stored in `~/.npm` on Linux/macOS
        path: ~/.npm
        key: ${{ runner.os }}-build-${{ env.cache-name }}-${{ hashFiles('**/package-lock.json') }}
        restore-keys: |
          ${{ runner.os }}-build-${{ env.cache-name }}-
          ${{ runner.os }}-build-
          ${{ runner.os }}-
    - name: Build
      run: npm install
    - run: node opensauced-admin/action.js
```

## goals-caching
Intializes the data.json and stars.json files. These files are used to render cachedd data to improve rendering of the Open Sauced dashboard.

**example usage:**
```yml
jobs:
  sauce-grab:
    name: Open Sauced Issue Caching
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
      with:
        node-version: 16
    - name: Build
      run: npm install
    - uses: open-sauced/actions/goals-caching@docker
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    - name: Set up Git
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      run: |
        git config user.name GitHub
        git config user.email noreply@github.com
        git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git
    - name: Commit and push changes
      run: |
        git add .
        if output=$(git status --porcelain) && [ ! -z "$output" ]; then
          git commit --author "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>" --message "update the goals cache"
          git push
        fi
```
