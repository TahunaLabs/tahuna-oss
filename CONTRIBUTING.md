# Contributing to Tahuna

Thanks for helping improve Tahuna. This is an open-source project licensed
under the GNU Affero General Public License v3.0 only; contributions are
distributed under the same terms in [`LICENSE.md`](LICENSE.md).

## Before opening a pull request

Open an issue for substantial features or architecture changes so the approach
can be agreed before implementation. Small fixes can go directly to a pull
request.

- Keep each change focused and follow the patterns in the surrounding code.
- Never commit credentials, customer data, generated artifacts, or local env files.
- Add or update documentation when behavior or configuration changes.
- Explain how the change was validated.

## Development

The repository uses Bun for the web and docs projects and Go for the CLI and
runtime:

```bash
make install-web
make install-cli
```

Run the checks for the area you changed:

```bash
cd web && bun run lint
cd docs && bun run lint && bun run build
make validate-cli
make validate-warden
```

For self-hosting changes, also validate the Compose configuration:

```bash
docker compose --env-file docker/.env.example -f docker/docker-compose.yml config --quiet
```

By submitting a contribution, you confirm that you have the right to provide
it under the repository license.
