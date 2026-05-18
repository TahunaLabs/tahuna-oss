output "pages_projects" {
  value = {
    for key, project in cloudflare_pages_project.projects : key => {
      name      = project.name
      subdomain = project.subdomain
    }
  }
}

output "pages_custom_domains" {
  value = {
    for key, domain in cloudflare_pages_domain.custom_domains : key => {
      domain = domain.name
      status = domain.status
    }
  }
}

output "assets_bucket" {
  value = {
    name         = cloudflare_r2_bucket.assets.name
    jurisdiction = cloudflare_r2_bucket.assets.jurisdiction
  }
}
