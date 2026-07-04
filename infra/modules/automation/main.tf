# n8n self-hosted: EC2 t4g.micro (ARM) con Docker, en subred pública.
variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_id" { type = string }
variable "instance_type" {
  type    = string
  default = "t4g.micro"
}
variable "n8n_host" {
  type        = string
  description = "Dominio para n8n (ej. n8n.badboys.example.com)"
}
variable "admin_cidr" {
  type        = string
  description = "CIDR permitido para SSH (IP del administrador)"
}

data "aws_ami" "al2023_arm" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }
}

resource "aws_security_group" "n8n" {
  name_prefix = "${var.name_prefix}-n8n-"
  vpc_id      = var.vpc_id
  ingress {
    description = "HTTPS (Caddy reverse proxy)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirect + ACME)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "SSH restringido"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "n8n" {
  ami                    = data.aws_ami.al2023_arm.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.n8n.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    dnf install -y docker
    systemctl enable --now docker
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64" \
      -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
    mkdir -p /opt/n8n && cd /opt/n8n
    cat > docker-compose.yml <<'COMPOSE'
    services:
      caddy:
        image: caddy:2
        restart: unless-stopped
        ports: ["80:80", "443:443"]
        volumes: ["./Caddyfile:/etc/caddy/Caddyfile", "caddy-data:/data"]
      n8n:
        image: n8nio/n8n:latest
        restart: unless-stopped
        environment:
          - N8N_HOST=${var.n8n_host}
          - N8N_PROTOCOL=https
          - WEBHOOK_URL=https://${var.n8n_host}/
          - GENERIC_TIMEZONE=America/Bogota
          - TZ=America/Bogota
        volumes: ["n8n-data:/home/node/.n8n"]
    volumes:
      caddy-data:
      n8n-data:
    COMPOSE
    cat > Caddyfile <<'CADDY'
    ${var.n8n_host} {
        reverse_proxy n8n:5678
    }
    CADDY
    /usr/local/bin/docker-compose up -d
  EOF

  tags = { Name = "${var.name_prefix}-n8n" }
}

resource "aws_eip" "n8n" {
  instance = aws_instance.n8n.id
  tags     = { Name = "${var.name_prefix}-n8n" }
}

output "n8n_public_ip" { value = aws_eip.n8n.public_ip }
output "n8n_private_ip" { value = aws_instance.n8n.private_ip }
