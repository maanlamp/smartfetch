export default async function smartfetch (url = "", options = {
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
	const retryStatusTexts = [
		"Internal Server Error", //500
		"Bad Gateway", //502
		"Service Unavailable", //503
		"Gateway Timeout", //504
		"Too Many Requests" //429
	];

	try {
		const response = await $try(url, maxTries);
		return await cache(url, await response[format]());
	} catch (error) {
		if (error.status) return error;
		throw error;
	}

	function getFetchSafeOptions (object) {
		//Filter safe headers from object
		return {
			headers: {
				"Accept": `application/${format}`
			}
		};
	}

	function padding (tries) {
		return tries ** 2 * 1000 + Math.floor(Math.random() * 1000);
	}

	function inCache (url) {
		const value = store.get(url);
		return (value !== null && value !== undefined)
			? value
			: false;
	}

	function cannotRetry (error) {
		return !(retryStatusCodes.includes(error.status)
			|| (error.statusText && retryStatusTexts
					.some(retryErr => error.statusText
						.toLowerCase()
						.match(retryErr.toLowerCase()))));
	}

	async function cache (key, value) {
		store.set(key, value);
		return value;
	}

	function timeoutProvided (headers) {
		return headers.has("Retry-After");
	}

	function handleRetryAfter (after) {
		const dateRegex = /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT/; //As per https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Date
		const secondsRegex = /^\d+$/;
		const stringified = String(after);
		const numberified = Number(after);

		if (!dateRegex.test(stringified)
			&& !secondsRegex.test(stringified)) throw new Error(`Retry-After header has an invalid format, cannot retry.\n${stringified}`); //Invalid format. No point in retrying.

		if (dateRegex.test(stringified)) {
			const timeout = Date.parse(stringified) - Date.now();
			if (timeout <= maxTimeout * 1000) return timeout;
			throw new Error(`Retry-After header exceeds maximum timeout length (${maxTimeout})`);
		}

		if (numberified <= maxTimeout) return numberified * 1000; //Retry-After should give back seconds, convert to ms
	}

	function timeout (error, tries) {
		const timeout = (timeoutProvided(error.headers))
			? handleRetryAfter(error.headers.get("Retry-After"))
			: padding(tries);

		return new Promise(resolve => {
			setTimeout(resolve, timeout);
		});
	}

	async function $try (url, maxTries, tries = 0) {
		if (tries >= maxTries) throw new Error(`Polling limit (${maxTries}) was exceeded without getting a valid response.`);
		try {
			return await fetch(url, fetchOptions);
		} catch (error) {
			if (cannotRetry(error)) throw error;
			await timeout(error, tries++);
			return $try(url, maxTries, tries);
		}
	}
}