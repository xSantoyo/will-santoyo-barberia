variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "multi_az" {
  type    = bool
  default = false
}
variable "db_name" {
  type    = string
  default = "badboys"
}
variable "db_username" {
  type    = string
  default = "badboys"
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "db" {
  name_prefix = "${var.name_prefix}-db-"
  vpc_id      = var.vpc_id
  # Solo tráfico interno de la VPC (Lambda y n8n).
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier                  = "${var.name_prefix}-postgres"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.instance_class
  allocated_storage           = 20
  storage_type                = "gp3"
  db_name                     = var.db_name
  username                    = var.db_username
  password                    = random_password.db.result
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  multi_az                    = var.multi_az
  publicly_accessible         = false
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name_prefix}-final"
  backup_retention_period     = 7
  deletion_protection         = true
  performance_insights_enabled = false
  tags                        = { Name = "${var.name_prefix}-postgres" }
}

output "db_endpoint" { value = aws_db_instance.main.address }
output "db_name" { value = var.db_name }
output "db_username" { value = var.db_username }
output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
output "db_security_group_id" { value = aws_security_group.db.id }
