# @aec-craft/platform-id-permissions

The permission model buildOS ID deploys: `namespaces.keto.ts` (Ory Permission
Language) and the `keto.yml` that serves it.

It exists for one reason. A service that authorizes against Keto has tests that
write and read tuples, and Keto refuses a namespace it does not know, so those
tests need a Keto booted on this model. Without a package the consumer keeps a
copy of the file, and a copy nobody publishes is a copy that drifts: the tests
keep passing against a model production no longer runs.

## Using it

Mount the two files where Keto expects them. `keto.yml` names
`namespaces.keto.ts` by absolute path, so they have to land in the same
directory:

```bash
CONFIG=$(node -p "require('path').dirname(require.resolve('@aec-craft/platform-id-permissions/keto.yml'))")

docker run --rm --network host \
  -e DSN="$KETO_DSN" -e LOG_LEVEL=error \
  -v "$CONFIG:/etc/config/keto:ro" \
  oryd/keto:v0.14.0 migrate up --yes --config /etc/config/keto/keto.yml
```

Everything a deployment varies is an environment variable (Keto maps every
config path to one and the environment wins), so a consumer changes the DSN or
the log level without a config of its own. `limit.max_read_depth` is the one
value worth leaving alone: a check that exhausts the budget is answered as a
denial rather than an error, so a lower value here passes a test suite against
a model production would refuse.

## Where it comes from

`ory/keto/` in this repository, copied in at build time. That directory is what
the Keto image bakes and what the local stack mounts, so it stays the single
source; this package is how it leaves the repository.
