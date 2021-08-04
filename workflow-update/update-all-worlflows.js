import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config() 

const login = process.env.LOGIN

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  await app.eachRepository({installationId: 9812988}, async ({repository, octokit}) => {
    // checkout only goal repos
    if (repository.name !== "open-sauced-goals") {
      return
    }
    
    // for debugging 
    // if (repository.full_name !== "bdougie/open-sauced-goals") {
    //   return
    // }
    
    const {
      updated,
      data: { commit },
    } = await octokit.createOrUpdateTextFile({
      owner: login,
      repo: "open-sauced-goals",
      path: "goals-caching.yml",
      content: workflow,
      message: "updated from latest open-sauced/goals-template",
    });

    if (updated) {
      console.log("test.txt updated via %s", data.commit.html_url);
    } else {
      console.log("test.txt already up to date");
    }
    
    // remove 
    console.log(repository.html_url)
  })
}

const workflow = `
name: push issues data to goals

on:
  workflow_dispatch:
  issues: 
    types: ["opened", "edited", "deleted", "labeled", "unlabeled"]
    
  schedule: 
    - cron: "0 1 * * 0,2,4,6"

jobs:
  sauce-grab:
    name: Open Sauced Issue Caching
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: open-sauced/actions/goals-caching@main
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        LOGIN: ${{ github.repository_owner }}
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
`
run()
