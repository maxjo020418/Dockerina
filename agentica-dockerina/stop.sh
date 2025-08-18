#!/bin/bash

# Dockerina Web App Stop Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to get server port from .env file
get_server_port() {
    local port=3000  # default fallback
    if [ -f "server/.env" ]; then
        local env_port=$(grep "^PORT=" server/.env | cut -d'=' -f2)
        if [ ! -z "$env_port" ]; then
            port=$env_port
        fi
    fi
    echo $port
}

# Function to get client port from vite config or environment
get_client_port() {
    local port=5173  # vite default fallback
    
    # Try to extract port from vite.config.ts if it exists
    if [ -f "client/vite.config.ts" ]; then
        local config_port=$(grep -o "port.*[0-9]\+" client/vite.config.ts | grep -o "[0-9]\+" | head -1)
        if [ ! -z "$config_port" ]; then
            port=$config_port
        fi
    fi
    
    # Check environment variable (takes precedence)
    if [ ! -z "${VITE_PORT}" ]; then
        port=$VITE_PORT
    fi
    
    echo $port
}

echo "Stopping Dockerina Web App Services"
echo "======================================"

# Stop server
if [ -f logs/server.pid ]; then
    SERVER_PID=$(cat logs/server.pid)
    if kill -0 $SERVER_PID 2>/dev/null; then
        print_status "Stopping server (PID: $SERVER_PID)..."
        kill $SERVER_PID
        print_success "Server stopped"
    else
        print_warning "Server process not running"
    fi
    rm -f logs/server.pid
else
    print_warning "No server PID file found"
fi

# Stop client
if [ -f logs/client.pid ]; then
    CLIENT_PID=$(cat logs/client.pid)
    if kill -0 $CLIENT_PID 2>/dev/null; then
        print_status "Stopping client (PID: $CLIENT_PID)..."
        kill $CLIENT_PID
        print_success "Client stopped"
    else
        print_warning "Client process not running"
    fi
    rm -f logs/client.pid
else
    print_warning "No client PID file found"
fi

# Also kill any remaining node processes that might be related
print_status "Checking for any remaining processes..."

# Get ports from environment
SERVER_PORT=$(get_server_port)
CLIENT_PORT=$(get_client_port)

print_status "Checking for processes on server port $SERVER_PORT and client port $CLIENT_PORT..."

# Kill any processes on the configured ports
for port in $SERVER_PORT $CLIENT_PORT; do
    PID=$(lsof -ti:$port 2>/dev/null || true)
    if [ ! -z "$PID" ]; then
        print_status "Killing process on port $port (PID: $PID)"
        kill $PID 2>/dev/null || true
    fi
done

print_success "All services stopped successfully!"

# Clean up log files if requested
if [ "$1" = "--clean" ]; then
    print_status "Cleaning up log files..."
    rm -rf logs/
    print_success "Log files cleaned"
fi
