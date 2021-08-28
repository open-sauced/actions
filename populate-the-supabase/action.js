import { App } from "octokit"
import dotenv from "dotenv"
import { createClient } from '@supabase/supabase-js'

// TODO: move to env
const anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYyOTkzMDc3OCwiZXhwIjoxOTQ1NTA2Nzc4fQ.zcdbd7kDhk7iNSMo8SjsTaXi0wlLNNQcSZkzZ84NUDg"
const supabaseUrl = "https://ibcwmlhcimymasokhgvn.supabase.co"

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, anon_key)

dotenv.config() 

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  await app.eachRepository(async ({repository, octokit}) => {
    // checkout only goal repos
    if (repository.name !== "open-sauced-goals") {
      return
    }

    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: "stars.json"
      }).catch((err) => {
        console.log(`stars.json: ${err}`)
        return {data: {content: []}}
      });

      // convert from base64 to parseable JSOON 
      const content = Buffer.from(data.content, "base64").toString()
      const parsedData = JSON.parse(content)

      // update data with repo id
      for (const item of parsedData) {
        const [owner, repo] = item.full_name.split("/")
        const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
        item.id = currentRepoResponse.data.id
        await supabase.from('user_stars').insert({user_id: repository.owner.id,star_id: item.id})
      }
      
     // send parsedData to stars table
     await supabase.from('stars').upsert(parsedData  )
 
      console.log(`ADDED STARS FROM: ${repository.html_url}`)

      // send parsedData to supabase
      supabase.from('users')
      .upsert({id: repository.owner.id, login: repository.owner.login})
    
    } catch (err) {
      console.log(`ERROR: ${err}`)
      console.log(`SKIPPED: ${repository.html_url}`)
      return
    }
  });
}

run()