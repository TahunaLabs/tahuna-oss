locals {
  repository_source_config = merge(
    {
      owner                          = var.github_owner
      repo_name                      = var.github_repo_name
      production_branch              = var.production_branch
      production_deployments_enabled = true
      preview_deployment_setting     = "all"
      pr_comments_enabled            = true
    },
    var.github_owner_id == null ? {} : { owner_id = var.github_owner_id },
    var.github_repo_id == null ? {} : { repo_id = var.github_repo_id },
  )

  pages_projects = {
    frontend = {
      name                = var.frontend_project_name
      custom_domain       = var.frontend_custom_domain
      build_command       = "npx @cloudflare/next-on-pages@1"
      destination_dir     = ".vercel/output/static"
      root_dir            = "web"
      path_includes       = ["web/**"]
      production_env_vars = var.frontend_env_vars_production
      preview_env_vars    = var.frontend_env_vars_preview
    }
    docs = {
      name                = var.docs_project_name
      custom_domain       = var.docs_custom_domain
      build_command       = "bun run build"
      destination_dir     = "dist"
      root_dir            = "docs"
      path_includes       = ["docs/**"]
      production_env_vars = var.docs_env_vars_production
      preview_env_vars    = var.docs_env_vars_preview
    }
  }

  pages_custom_domains = {
    for key, project in local.pages_projects : key => project.custom_domain
    if project.custom_domain != null && trimspace(project.custom_domain) != ""
  }
}

resource "cloudflare_pages_project" "projects" {
  for_each = local.pages_projects

  account_id        = var.cloudflare_account_id
  name              = each.value.name
  production_branch = var.production_branch

  build_config = {
    build_caching   = true
    build_command   = each.value.build_command
    destination_dir = each.value.destination_dir
    root_dir        = each.value.root_dir
  }

  deployment_configs = {
    preview = {
      build_image_major_version = 3
      fail_open                 = false
      env_vars                  = each.value.preview_env_vars
    }
    production = {
      build_image_major_version = 3
      fail_open                 = false
      env_vars                  = each.value.production_env_vars
    }
  }

  source = {
    type = "github"
    config = merge(
      local.repository_source_config,
      {
        path_includes = each.value.path_includes
      },
    )
  }
}

resource "cloudflare_pages_domain" "custom_domains" {
  for_each = local.pages_custom_domains

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.projects[each.key].name
  name         = each.value
}

resource "cloudflare_dns_record" "pages_cname" {
  for_each = var.cloudflare_zone_id == null ? {} : local.pages_custom_domains

  zone_id = var.cloudflare_zone_id
  name    = each.value
  ttl     = 1
  type    = "CNAME"
  content = cloudflare_pages_project.projects[each.key].subdomain
  proxied = true
}

resource "cloudflare_r2_bucket" "assets" {
  account_id    = var.cloudflare_account_id
  name          = var.assets_bucket_name
  jurisdiction  = var.assets_bucket_jurisdiction
  location      = var.assets_bucket_location
  storage_class = var.assets_bucket_storage_class
}

resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.assets.name

  rules = [
    {
      allowed = {
        methods = ["GET", "HEAD"]
        origins = var.assets_bucket_cors_origins
      }
      expose_headers  = ["etag"]
      max_age_seconds = 3600
    }
  ]
}
