variable "cloudflare_account_id" {
  description = "Cloudflare account identifier."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare DNS zone identifier for tahuna.app. When null, DNS records are not managed."
  type        = string
  default     = null
  nullable    = true
}

variable "github_owner" {
  description = "GitHub organization or user connected to the Pages projects."
  type        = string
  default     = "TahunaLabs"
}

variable "github_owner_id" {
  description = "Numeric GitHub owner ID already connected in Cloudflare. Recommended for importing existing projects."
  type        = string
  default     = null
  nullable    = true
}

variable "github_repo_name" {
  description = "GitHub repository name connected to the Pages projects."
  type        = string
  default     = "tahuna"
}

variable "github_repo_id" {
  description = "Numeric GitHub repository ID already connected in Cloudflare. Recommended for importing existing projects."
  type        = string
  default     = null
  nullable    = true
}

variable "production_branch" {
  description = "Production branch for Cloudflare Pages."
  type        = string
  default     = "main"
}

variable "frontend_project_name" {
  description = "Cloudflare Pages project name for the frontend app."
  type        = string
  default     = "tahuna"
}

variable "docs_project_name" {
  description = "Cloudflare Pages project name for the docs app."
  type        = string
  default     = "tahuna-docs"
}

variable "frontend_custom_domain" {
  description = "Custom domain for the frontend Pages project."
  type        = string
  default     = "tahuna.app"
}

variable "docs_custom_domain" {
  description = "Custom domain for the docs Pages project."
  type        = string
  default     = "docs.tahuna.app"
}

variable "assets_bucket_name" {
  description = "Name of the public R2 bucket that serves shared assets."
  type        = string
}

variable "assets_bucket_location" {
  description = "Preferred R2 location hint."
  type        = string
  default     = "weur"
}

variable "assets_bucket_jurisdiction" {
  description = "R2 jurisdiction. Use default unless you have data residency requirements."
  type        = string
  default     = "default"
}

variable "assets_bucket_storage_class" {
  description = "Default storage class for newly uploaded objects."
  type        = string
  default     = "Standard"
}

variable "assets_bucket_cors_origins" {
  description = "Origins allowed to fetch public assets from the R2 bucket."
  type        = list(string)
  default = [
    "https://tahuna.app",
    "https://docs.tahuna.app",
  ]
}

variable "frontend_env_vars_production" {
  description = "Production environment variables for the frontend Pages project."
  type = map(object({
    type  = string
    value = string
  }))
  default = {
    NEXT_PUBLIC_CONVEX_URL = {
      type  = "plain_text"
      value = "https://unique-clownfish-231.convex.cloud"
    }
    NEXT_PUBLIC_CONVEX_SITE_URL = {
      type  = "plain_text"
      value = "https://unique-clownfish-231.convex.site"
    }
    NEXT_PUBLIC_DOCS_URL = {
      type  = "plain_text"
      value = "https://docs.tahuna.app"
    }
    NEXT_PUBLIC_SITE_URL = {
      type  = "plain_text"
      value = "https://tahuna.app"
    }
  }
}

variable "frontend_env_vars_preview" {
  description = "Preview environment variables for the frontend Pages project."
  type = map(object({
    type  = string
    value = string
  }))
  default = {}
}

variable "docs_env_vars_production" {
  description = "Production environment variables for the docs Pages project."
  type = map(object({
    type  = string
    value = string
  }))
  default = {}
}

variable "docs_env_vars_preview" {
  description = "Preview environment variables for the docs Pages project."
  type = map(object({
    type  = string
    value = string
  }))
  default = {}
}
