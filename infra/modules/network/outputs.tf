output "network_id" { value = google_compute_network.vpc.id }
output "network_name" { value = google_compute_network.vpc.name }
output "subnet_name" { value = google_compute_subnetwork.run.name }
output "private_services_connection" { value = google_service_networking_connection.private_services.id }
