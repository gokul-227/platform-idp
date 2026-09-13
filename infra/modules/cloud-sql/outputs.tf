output "connection_name" { value = google_sql_database_instance.this.connection_name }
output "instance_name" { value = google_sql_database_instance.this.name }

output "dsn_secret_ids" {
  description = "database name -> Secret Manager secret id holding its DSN."
  value       = { for db, secret in google_secret_manager_secret.dsn : db => secret.secret_id }
}
