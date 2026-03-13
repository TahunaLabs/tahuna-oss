# CLI Tests

Use this folder as the handoff entrypoint for running CLI tests.

## Run all tests

```bash
./tests/run_go_tests.sh
```

This keeps test execution centralized while Go `_test.go` files remain in the `cli/` package directory so they can access internal helpers.

## Run lint + tests

```bash
./tests/run_go_lint.sh
./tests/run_go_tests.sh
```

Or use the repo-level wrapper:

```bash
make validate-cli
```
