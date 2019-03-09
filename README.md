# "Smart" Fetch
A smartfetch is a request that retries 4 times ([implementing exponential backoff](https://developers.google.com/analytics/devguides/reporting/core/v3/errors#backoff)), but _only if_ the reason of failure is not a fatal one (i.e. "*userRateLimitExceeded*", etc...).

This means that there will be a greater chance of recovering from (accidental) rate limit exceedances or internal server errors.

Besides that, it will use a store (user configurable) to cache responses by url, so later smart requests can check if their provided url was already cached. Blazingly fast 🔥!

#### How to use
Just act as if it were the actual `fetch API`. It's what it uses anyway.

##### <code>smartRequest(_url_: url, _object_: options?) -> Promise\<response\></code>
Sends out a fetch request that retries `options.maxTries` (defaults to `5`) times if possible. If a fatal error occured, or the maximum amount of tries was exceeded, the promise rejects with an error. If all went well, it will cache the result from url in localStorage with the key of `url`, and resolve with a response.

`options` can contain the following properties:
- maxTries: maximum amount of tries before the fetch cancels, defaults to 5 (includes first try).
- format: the response format/type, defaults to "json".
- store: an object with the methods `get` and `set` to store and retrieve values respectively. Defaults to a wrapper object for `localStorage`.
- maxTimeout: the maximum amount of **seconds** the smartfetch will allow if a `Retry-After` header was recognised, defaults to 30.