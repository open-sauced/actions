import consoleHeader from './lib/consoleHeader.js'
import {p} from "@antfu/utils";
import {supabase} from "./lib/supabase.js";
import {App} from "octokit";

const limitUsers = parseInt(process.env.LIMIT_USERS) || 5;
const lastExecuted = new Date()
const checked = [];

consoleHeader(' OPEN |SAUCED', {
  font: 'block',
})
console.log(`Started execution at ${lastExecuted}`)

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  const {data: getUsersToBackfill, error} = await supabase
    .from('auth_users')
    .select('*')
    .not("raw_user_meta_data->sub", "in", `(${
      await supabase
        .from('users')
        .select('id::text')
        .then(({data}) => data.map(({id}) => id))
    })`)
    .limit(limitUsers)

  if (error) {
    console.log(`Unable to fetch users from supabase auth tables`, error)
    return
  }

  await p(getUsersToBackfill)
    .map(async (getUserToBackfill) => {
      const {
        sub: id,
        user_name: login,
      } = getUserToBackfill.raw_user_meta_data;

      const {data, error} = await supabase
        .from('users')
        .select()
        .eq('id', id);

      if (error) {
        console.log(`Unable to double check users from supabase auth tables`, error)
        return
      }

      if (!data.length) {
        let open_issues = 0;
        let is_private = false;
        let is_open_sauced_member = true;
        let has_stars_data = true;

        try {
          const {data: installationExists, error} = await app.octokit.rest.apps
            .getRepoInstallation({
              owner: login,
              repo: 'open-sauced-goals',
            });

          if (installationExists) {
            const octokit = await app.getInstallationOctokit(installationExists.id)

            const {data: {
              open_issues,
              private: is_private,
            }} = await octokit.rest.repos.get({
              owner: login,
              repo: 'open-sauced-goals',
            })
          }
        } catch (e) {
          is_open_sauced_member = false;
          has_stars_data = false;
        }

        const user = {
          id,
          open_issues,
          is_private,
          is_open_sauced_member,
          has_stars_data,
          login,
        };

        const {data: [dbUser], error} = await supabase
          .from('users')
          .upsert(user, {
            onConflict: 'id',
          })

        if (!error) {
          checked.push(dbUser);
        }
      }
    })

  consoleHeader('Versioning changes')
  console.log('Parsed users:', checked.length)
}

await run()
