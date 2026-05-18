# Cloudflare Terraform

This Terraform root manages Tahuna's Cloudflare hosting surface:

- the existing frontend Pages project (`tahuna`)
- the docs Pages project (`tahuna-docs`)
- the public R2 assets bucket used by the web and docs apps
- optional Pages custom domains and matching DNS records

App deployments are expected to happen through Cloudflare's Git integration for Pages. The GitHub Actions workflow in this repo only manages infrastructure state, plans, and applies.

## Managed resources

- `cloudflare_pages_project.projects["frontend"]`
- `cloudflare_pages_project.projects["docs"]`
- `cloudflare_pages_domain.custom_domains[*]`
- `cloudflare_dns_record.pages_cname[*]` when `cloudflare_zone_id` is set
- `cloudflare_r2_bucket.assets`
- `cloudflare_r2_bucket_cors.assets`

## Layout

- `versions.tf`: Terraform and provider versions
- `variables.tf`: repo-specific inputs
- `main.tf`: Pages, DNS, and R2 resources
- `outputs.tf`: useful project outputs
- `terraform.tfvars.example`: starter values for local use

## Required local inputs

Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in the account-specific values.

Authentication is expected via `CLOUDFLARE_API_TOKEN`.

For remote state on R2, initialize with backend config rather than committing credentials:

```bash
cd infra/cloudflare
terraform init \
  -backend-config="bucket=<tfstate-bucket>" \
  -backend-config="key=<env>/cloudflare/terraform.tfstate" \
  -backend-config="region=auto" \
  -backend-config="skip_credentials_validation=true" \
  -backend-config="skip_metadata_api_check=true" \
  -backend-config="skip_region_validation=true" \
  -backend-config="skip_requesting_account_id=true" \
  -backend-config="skip_s3_checksum=true" \
  -backend-config="use_path_style=true" \
  -backend-config="access_key=<r2-access-key-id>" \
  -backend-config="secret_key=<r2-secret-access-key>" \
  -backend-config='endpoints={s3="https://<account-id>.r2.cloudflarestorage.com"}'
```

That backend pattern follows Cloudflare's documented R2 remote backend setup.

## One-time adoption steps

The frontend Pages project already exists and should be imported before the first apply:

```bash
cd infra/cloudflare
terraform import 'cloudflare_pages_project.projects["frontend"]' '<account_id>/<frontend_project_name>'
```

If these already exist in Cloudflare, import them before the first apply as well:

```bash
terraform import cloudflare_pages_domain.custom_domains["frontend"] '<account_id>/<frontend_project_name>/<frontend_custom_domain>'
terraform import cloudflare_dns_record.pages_cname["frontend"] '<zone_id>/<dns_record_id>'
terraform import cloudflare_r2_bucket.assets '<account_id>/<assets_bucket_name>/<assets_bucket_jurisdiction>'
```

The docs Pages project can be created by Terraform if it does not already exist.

## CI/CD configuration

The workflow at `.github/workflows/cloudflare-terraform.yml` expects these repository settings:

Repository variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_ASSETS_BUCKET_NAME`
- `GITHUB_OWNER_ID` optional but recommended for imported Pages projects
- `GITHUB_REPO_ID` optional but recommended for imported Pages projects
- `TFSTATE_R2_BUCKET`
- `TFSTATE_R2_KEY`
- `TFSTATE_R2_ENDPOINT`

Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `TFSTATE_R2_ACCESS_KEY_ID`
- `TFSTATE_R2_SECRET_ACCESS_KEY`

The Cloudflare API token needs permissions for:

- `Pages Write`
- `Pages Read`
- `DNS Write` if Terraform manages custom-domain DNS
- `Workers R2 Storage Write`

The state bucket credentials need S3-compatible access scoped to the dedicated Terraform state bucket.

## Validation

Run locally:

```bash
cd infra/cloudflare
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```
