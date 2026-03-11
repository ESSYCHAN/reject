# REJECT Kubernetes Deployment

## Prerequisites
- kubectl configured for your cluster
- NGINX Ingress Controller installed
- cert-manager for TLS (optional)

## Quick Deploy

```bash
# 1. Create namespace
kubectl apply -f namespace.yaml

# 2. Create secrets from your .env file
kubectl create secret generic reject-secrets \
  --from-env-file=../.env \
  -n reject

# 3. Deploy all services
kubectl apply -f server.yaml
kubectl apply -f agents.yaml
kubectl apply -f client.yaml

# 4. Set up ingress (update hosts first)
kubectl apply -f ingress.yaml

# 5. Enable autoscaling
kubectl apply -f hpa.yaml
```

## Update Images

Replace `OWNER` in the yaml files with your GitHub username/org.

## Useful Commands

```bash
# Check pods
kubectl get pods -n reject

# Check services
kubectl get svc -n reject

# View logs
kubectl logs -f deployment/server -n reject

# Scale manually
kubectl scale deployment/server --replicas=5 -n reject

# Check HPA status
kubectl get hpa -n reject
```
