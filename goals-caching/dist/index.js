import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 803:
/***/ ((__webpack_module__, __unused_webpack___webpack_exports__, __nccwpck_require__) => {

"use strict";
__nccwpck_require__.a(__webpack_module__, async (__webpack_handle_async_dependencies__) => {
/* harmony import */ var octokit__WEBPACK_IMPORTED_MODULE_0__ = __nccwpck_require__(650);
/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1__ = __nccwpck_require__(747);



const login = process.env.LOGIN
const octokit = new octokit__WEBPACK_IMPORTED_MODULE_0__.Octokit({
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
	number:goal.number,
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
fs__WEBPACK_IMPORTED_MODULE_1__.writeFileSync("data.json", JSON.stringify(repoGoalsData, null, 2));
fs__WEBPACK_IMPORTED_MODULE_1__.writeFileSync("stars.json", JSON.stringify(starsData, null, 2));

__webpack_handle_async_dependencies__();
}, 1);

/***/ }),

/***/ 650:
/***/ ((module) => {

module.exports = eval("require")("octokit");


/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("fs");

/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/async module */
/******/ (() => {
/******/ 	var webpackThen = typeof Symbol === "function" ? Symbol("webpack then") : "__webpack_then__";
/******/ 	var webpackExports = typeof Symbol === "function" ? Symbol("webpack exports") : "__webpack_exports__";
/******/ 	var completeQueue = (queue) => {
/******/ 		if(queue) {
/******/ 			queue.forEach((fn) => (fn.r--));
/******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
/******/ 		}
/******/ 	}
/******/ 	var completeFunction = (fn) => (!--fn.r && fn());
/******/ 	var queueFunction = (queue, fn) => (queue ? queue.push(fn) : completeFunction(fn));
/******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
/******/ 		if(dep !== null && typeof dep === "object") {
/******/ 			if(dep[webpackThen]) return dep;
/******/ 			if(dep.then) {
/******/ 				var queue = [];
/******/ 				dep.then((r) => {
/******/ 					obj[webpackExports] = r;
/******/ 					completeQueue(queue);
/******/ 					queue = 0;
/******/ 				});
/******/ 				var obj = {};
/******/ 											obj[webpackThen] = (fn, reject) => (queueFunction(queue, fn), dep.catch(reject));
/******/ 				return obj;
/******/ 			}
/******/ 		}
/******/ 		var ret = {};
/******/ 							ret[webpackThen] = (fn) => (completeFunction(fn));
/******/ 							ret[webpackExports] = dep;
/******/ 							return ret;
/******/ 	}));
/******/ 	__nccwpck_require__.a = (module, body, hasAwait) => {
/******/ 		var queue = hasAwait && [];
/******/ 		var exports = module.exports;
/******/ 		var currentDeps;
/******/ 		var outerResolve;
/******/ 		var reject;
/******/ 		var isEvaluating = true;
/******/ 		var nested = false;
/******/ 		var whenAll = (deps, onResolve, onReject) => {
/******/ 			if (nested) return;
/******/ 			nested = true;
/******/ 			onResolve.r += deps.length;
/******/ 			deps.map((dep, i) => (dep[webpackThen](onResolve, onReject)));
/******/ 			nested = false;
/******/ 		};
/******/ 		var promise = new Promise((resolve, rej) => {
/******/ 			reject = rej;
/******/ 			outerResolve = () => (resolve(exports), completeQueue(queue), queue = 0);
/******/ 		});
/******/ 		promise[webpackExports] = exports;
/******/ 		promise[webpackThen] = (fn, rejectFn) => {
/******/ 			if (isEvaluating) { return completeFunction(fn); }
/******/ 			if (currentDeps) whenAll(currentDeps, fn, rejectFn);
/******/ 			queueFunction(queue, fn);
/******/ 			promise.catch(rejectFn);
/******/ 		};
/******/ 		module.exports = promise;
/******/ 		body((deps) => {
/******/ 			if(!deps) return outerResolve();
/******/ 			currentDeps = wrapDeps(deps);
/******/ 			var fn, result;
/******/ 			var promise = new Promise((resolve, reject) => {
/******/ 				fn = () => (resolve(result = currentDeps.map((d) => (d[webpackExports]))));
/******/ 				fn.r = 0;
/******/ 				whenAll(currentDeps, fn, reject);
/******/ 			});
/******/ 			return fn.r ? promise : result;
/******/ 		}).then(outerResolve, reject);
/******/ 		isEvaluating = false;
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
/******/ 
/******/ // startup
/******/ // Load entry module and return exports
/******/ // This entry module used 'module' so it can't be inlined
/******/ var __webpack_exports__ = __nccwpck_require__(803);
/******/ 
