import {Octokit} from "octokit"
import fs from "fs";

const login = process.env.LOGIN
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
// fest authenticated users stars
async function getStars(user) {
  const {data} = await octokit.request('GET /users/{user}/starred', {
    user: user,
  }).catch(err => {
    console.log(err)
  })
  return Promise.all(
    data.map(async repo => {

    return {
      id: repo.id,
      full_name: repo.full_name,
      stargazers_count: repo.stargazers_count,
      open_issues_count: repo.open_issues_count,
      forks_count: repo.forks_count
    }
  }))
}

async function getRepoGoals(issues) {
  return Promise.all(
    issues.map(async issue => {
      // all goal issues follow the "owner/repo" format 
      let [owner, name] = issue.title.split("/");

      const {data} = await octokit.rest.repos.get({
        owner: owner,
        repo: name,
      })
      console.log(`Title: ${issue.title} vs. ${data.full_name}`);
      if(data.full_name.trim() !== issue.title){
	goalsToRename.push({title:data.full_name,number:issue.number})
      }
      return {
        full_name: data.full_name,
        stargazers_count: data.stargazers_count,
        open_issues_count: data.open_issues_count,
        forks_count: data.forks_count,
      }
    }),
  );
}
async function renameGoals(){
  return Promise.all(
    goalsToRename.map(async goal => {
      return await octokit.rest.issues.update({
        owner:login,
	repo:"open-sauced-goals",
	issue_number:goal.number,
        title:goal.title
      })
    })
  );

}
const starsData = await getStars(login)

// goals fetch and combine that with the stars
// fetch all goal repos
let repoIssues
let stagedIssues
let goalsToRename = [];
try {
  stagedIssues = await octokit.rest.issues.listForRepo({
    owner: login,
    repo: "open-sauced-goals" 
  })
  console.log("stagedIssues", stagedIssues)
  repoIssues = await octokit.paginate(stagedIssues);
} catch (err) {
  console.log(err)
}
  
const repoGoalsData = await getRepoGoals(repoIssues)
if(goalsToRename.length > 0) await renameGoals()
// create or update the json store
fs.writeFileSync("data.json", JSON.stringify(repoGoalsData, null, 2));
fs.writeFileSync("stars.json", JSON.stringify(starsData, null, 2));
