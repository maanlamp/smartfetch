"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = smartfetch;

async function smartfetch(url = "", options = {
  maxTries: 5,
  format: "json",
  store: {
    get: key => JSON.parse(window.localStorage.getItem(String(key))),
    set: (key, val) => window.localStorage.setItem(String(key), JSON.stringify(val))
  },
  format: "json",
  maxTimeout: 30
}) {
  //Acts like a fetch, but retries n times before rejecting if server is busy
  //implements exponential backoff https://developers.google.com/analytics/devguides/reporting/core/v3/errors#backoff
  const cached = inCache(url);
  if (cached !== false) return cached;
  const fetchOptions = getFetchSafeOptions(options);
  const maxTries = options.maxTries;
  const retryStatusCodes = [500, 502, 503, 504, 429];
  const retryStatusTexts = ["Internal Server Error", //500
  "Bad Gateway", //502
  "Service Unavailable", //503
  "Gateway Timeout", //504
  "Too Many Requests" //429
  ];

  try {
    const response = await $try(url, maxTries);
    return await cache(url, (await response[format]()));
  } catch (error) {
    if (error.status) return error;
    throw error;
  }

  function getFetchSafeOptions(object) {
    //Filter safe headers from object
    return {
      headers: {
        "Accept": `application/${format}`
      }
    };
  }

  function padding(tries) {
    return tries ** 2 * 1000 + Math.floor(Math.random() * 1000);
  }

  function inCache(url) {
    const value = store.get(url);
    return value !== null && value !== undefined ? value : false;
  }

  function cannotRetry(error) {
    return !(retryStatusCodes.includes(error.status) || error.statusText && retryStatusTexts.some(retryErr => error.statusText.toLowerCase().match(retryErr.toLowerCase())));
  }

  async function cache(key, value) {
    store.set(key, value);
    return value;
  }

  function timeoutProvided(headers) {
    return headers.has("Retry-After");
  }

  function handleRetryAfter(after) {
    const dateRegex = /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT/; //As per https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Date

    const secondsRegex = /^\d+$/;
    const stringified = String(after);
    const numberified = Number(after);
    if (!dateRegex.test(stringified) && !secondsRegex.test(stringified)) throw new Error(`Retry-After header has an invalid format, cannot retry.\n${stringified}`); //Invalid format. No point in retrying.

    if (dateRegex.test(stringified)) {
      const timeout = Date.parse(stringified) - Date.now();
      if (timeout <= maxTimeout * 1000) return timeout;
      throw new Error(`Retry-After header exceeds maximum timeout length (${maxTimeout})`);
    }

    if (numberified <= maxTimeout) return numberified * 1000; //Retry-After should give back seconds, convert to ms
  }

  function timeout(error, tries) {
    const timeout = timeoutProvided(error.headers) ? handleRetryAfter(error.headers.get("Retry-After")) : padding(tries);
    return new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  }

  async function $try(url, maxTries, tries = 0) {
    if (tries >= maxTries) throw new Error(`Polling limit (${maxTries}) was exceeded without getting a valid response.`);

    try {
      return await fetch(url, fetchOptions);
    } catch (error) {
      if (cannotRetry(error)) throw error;
      await timeout(error, tries++);
      return $try(url, maxTries, tries);
    }
  }
} // function range (size = 0, end = size) {
// 	//refactor this shizzle?
// 	if (size === end) return [...Array(size).keys()];
// 	return [...Array(end - size).keys()].map((_, i) => i + size);
// }
// function timeout (timeout) {
// 	return new Promise(resolve => {
// 		setTimeout(resolve, timeout);
// 	});
// }
// function expBackoff (tries) {
// 	return tries ** 2 * 1000 + Math.floor(Math.random() * 1000) * Number(tries);
// }
// function invertPromise (promise) {
// 	return new Promise((resolve, reject) => promise.then(reject, resolve));
// }
// function firstResolved (promises) {
// 	return invertPromise(Promise.all(promises.map(invertPromise)));
// }
// async function correctFetchResponse (request) {
// 	const response = await request;
// 	if (response.status >= 200 && response.status < 300) return response;
// 	else throw response;
// }
// export default function smartfetch (url, {
// 	maxTries = 5,
// 	maxTimeout = 30,
// 	format = "json",
// 	useCache = true,
// 	cache = {
// 		get: (key) => localStorage.getItem(String(key)),
// 		set: (key, value) => localStorage.setItem(String(key), value),
// 		contains: (key) => localStorage.getItem(String(key)) !== null,
// 		getTransformer: (val) => JSON.parse(val),
// 		setTransformer: (val) => JSON.stringify(val),
// 		keyTransformer: (response) => response.url,
// 		valueTransformer: async (response) => response[format]()
// 	}
// } = {}) {
// 	function inCache (key) {
// 		return cache.contains(key);
// 	}
// 	function setCache (key, value) {
// 		cache.set(key, (typeof cache.setTransformer === "function")
// 			? cache.setTransformer(value)
// 			: value);
// 		return value;
// 	}
// 	function getCache (key) {
// 		const value = cache.get(key);
// 		return (typeof cache.getTransformer === "function")
// 			? cache.getTransformer(value)
// 			: value;
// 	}
// 	const controller = new AbortController();
// 	const { signal } = controller;
// 	const queue = range(maxTries)
// 		.map(tries => timeout(expBackoff(tries)))
// 		.map(timeout => timeout.then(() => fetch(url, { signal })))
// 		.map(correctFetchResponse);
// 	const response = firstResolved(queue)
// 		.then(async response => {
// 			console.log("first was resolved");
// 			// controller.abort(); // Should abort after proper response
// 			if (useCache) {
// 				const key = (typeof cache.keyTransformer === "function")
// 					? await cache.keyTransformer(response)
// 					: response.url;
// 				const val = (typeof cache.valueTransformer === "function")
// 					? await cache.valueTransformer(response)
// 					: await response[format]();
// 				if (!inCache(key)) setCache(key, val);
// 				return getCache(key);
// 			}
// 			return response[format]();
// 		});
// 	function abort () {
// 		controller.abort();
// 		//Should immediately reject request, not error x remaining times and then throw [errors].
// 	}
// 	return Object.assign(response, { abort });
// }