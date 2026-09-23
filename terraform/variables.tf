variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "key_name" {
  type        = string
  description = "Existing AWS EC2 key pair name"
}

variable "ssh_cidr" {
  type        = string
  description = "CIDR allowed to reach SSH"
  default     = "0.0.0.0/0"
}

