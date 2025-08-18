#!/bin/bash

# Dockerina Web App Run Script
# This script runs both the client and server components

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get server port from environment or default
get_server_port() {
    local port=${PORT:-3000}
    echo "$port"
}

# Function to get client port from vite config or environment
get_client_port() {
    local port=${VITE_PORT:-5173}  # Vite default port
    
    # Try to extract port from vite.config.ts if it exists
    if [ -f "client/vite.config.ts" ]; then
        local config_port=$(grep -o "port.*[0-9]\+" client/vite.config.ts | grep -o "[0-9]\+" | head -1)
        if [ -n "$config_port" ]; then
            port=$config_port
        fi
    fi
    
    echo "$port"
}

# Function to get client host from environment or default
get_client_host() {
    local host=${VITE_HOST:-localhost}
    echo "$host"
}

# Function to get server host from environment or default
get_server_host() {
    local host=${HOST:-localhost}
    echo "$host"
}

# Function to check if port is in use
is_port_in_use() {
    local port=$1
    if command_exists lsof; then
        lsof -i ":$port" >/dev/null 2>&1
    elif command_exists netstat; then
        netstat -ln 2>/dev/null | grep ":$port " >/dev/null 2>&1
    else
        # Fallback: try to connect to the port
        timeout 1 bash -c "</dev/tcp/localhost/$port" 2>/dev/null
    fi
}

# Function to start server
start_server() {
    print_status "Starting server..."
    cd server
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found in server directory. Run build.sh first."
        return 1
    fi
    
    if [ ! -d "lib" ] && [ ! -d "dist" ] && [ ! -d "build" ]; then
        print_warning "Built server files not found. You may need to run build.sh first."
    fi
    
    # Start server in background
    pnpm start &
    SERVER_PID=$!
    
    cd ..
    return 0
}

# Function to start client
start_client() {
    print_status "Starting client..."
    cd client
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found in client directory. Run build.sh first."
        return 1
    fi
    
    # Start client in background
    pnpm start &
    CLIENT_PID=$!
    
    cd ..
    return 0
}

# Function to cleanup on exit
cleanup() {
    echo ""
    print_status "Shutting down services..."
    
    if [ -n "$SERVER_PID" ]; then
        print_status "Stopping server (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
    fi
    
    if [ -n "$CLIENT_PID" ]; then
        print_status "Stopping client (PID: $CLIENT_PID)..."
        kill $CLIENT_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on the ports
    local server_port=$(get_server_port)
    local client_port=$(get_client_port)
    
    if is_port_in_use $server_port; then
        print_status "Cleaning up remaining processes on port $server_port..."
        pkill -f ".*:$server_port" 2>/dev/null || true
    fi
    
    if is_port_in_use $client_port; then
        print_status "Cleaning up remaining processes on port $client_port..."
        pkill -f ".*:$client_port" 2>/dev/null || true
    fi
    
    print_success "Cleanup completed"
    exit 0
}

# Function to wait for service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $service_name to be ready on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if is_port_in_use $port; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_warning "$service_name may not have started properly on port $port"
    return 1
}

# Main run function
main() {
    echo ""
    echo "Dockerina Web App Runner"
    echo "============================"
    echo ""
    
    # Check prerequisites
    if ! command_exists pnpm; then
        print_error "pnpm is not installed. Please run build.sh first."
        exit 1
    fi
    
    # Get script directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR"
    
    # Verify we're in the right directory
    if [ ! -d "client" ] || [ ! -d "server" ]; then
        print_error "client or server directory not found. Are you in the correct directory?"
        exit 1
    fi
    
    # Get dynamic port configuration
    SERVER_PORT=$(get_server_port)
    CLIENT_PORT=$(get_client_port)
    SERVER_HOST=$(get_server_host)
    CLIENT_HOST=$(get_client_host)
    
    # Check if ports are already in use
    if is_port_in_use $SERVER_PORT; then
        print_warning "Port $SERVER_PORT is already in use. Server may not start properly."
    fi
    
    if is_port_in_use $CLIENT_PORT; then
        print_warning "Port $CLIENT_PORT is already in use. Client may not start properly."
    fi
    
    # Set up signal handlers for graceful shutdown
    trap cleanup SIGINT SIGTERM EXIT
    
    # Start services
    print_status "Starting services..."
    
    if ! start_server; then
        print_error "Failed to start server"
        exit 1
    fi
    
    if ! start_client; then
        print_error "Failed to start client"
        exit 1
    fi
    
    # Wait for services to be ready
    wait_for_service $SERVER_PORT "Server"
    wait_for_service $CLIENT_PORT "Client"
    
    echo ""
    print_success "✅ Both services are running!"
    echo ""
    echo "Service URLs:"
    echo "  Client: http://${CLIENT_HOST}:${CLIENT_PORT}"
    echo "  Server: http://${SERVER_HOST}:${SERVER_PORT}"
    echo ""
    echo "Environment Variables (customize `.env` as needed):"
    echo "  • VITE_HOST=${CLIENT_HOST} (client host)"
    echo "  • VITE_PORT=${CLIENT_PORT} (client port)"
    echo "  • HOST=${SERVER_HOST} (server host)"
    echo "  • PORT=${SERVER_PORT} (server port)"
    echo ""
    print_status "Press Ctrl+C to stop both services"
    echo ""
    
    # Wait for processes to finish
    wait $SERVER_PID $CLIENT_PID
}

# Run main function
main "$@"
