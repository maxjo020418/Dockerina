#!/bin/bash

# Dockerina Web App Build Script

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

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        local node_version=$(node --version | sed 's/v//')
        local major_version=$(echo $node_version | cut -d. -f1)
        
        if [ "$major_version" -ge 18 ]; then
            print_success "Node.js version $node_version is compatible"
            return 0
        else
            print_error "Node.js version $node_version is too old. Please install Node.js 18 or higher"
            return 1
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher"
        return 1
    fi
}

# Function to install pnpm if not present
install_pnpm() {
    if ! command_exists pnpm; then
        print_status "Installing pnpm..."
        npm install -g pnpm
        print_success "pnpm installed successfully"
    else
        print_success "pnpm is already installed"
    fi
}

# Function to setup environment files
setup_env_files() {
    print_status "Setting up environment files..."
    
    # Server .env file
    if [ ! -f "server/.env" ]; then
        print_status "Creating server/.env file..."
        cat > server/.env << EOF
# Dockerina Server Environment Configuration
OPENAI_API_KEY=NO_KEY
BASE_URL=http://localhost:11434/v1
MODEL=qwen3:14b
PORT=3000
ENABLE_HTTP_LOGGING=false
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_PORT=2375
DOCKER_EXEC_TIMEOUT_MS=30000
EOF
        print_success "Created server/.env file with default values"
    else
        print_warning "server/.env already exists, skipping creation"
    fi
    
    # Client .env file
    if [ ! -f "client/.env" ]; then
        print_status "Creating client/.env file..."
        cat > client/.env << EOF
# Dockerina Client Environment Configuration
VITE_AGENTICA_WS_URL=ws://localhost:3000/chat
# VITE_PORTAINER_URL=http://localhost:9000
EOF
        print_success "Created client/.env file with default values"
    else
        print_warning "client/.env already exists, skipping creation"
    fi
}

# Function to install dependencies and build
build_project() {
    print_status "Installing and building server workspace..."
    
    # Go to server directory and install/build workspace dependencies
    cd server
    print_status "Installing server workspace dependencies..."
    pnpm install
    
    # Build agentica core and rpc packages (workspace dependencies)
    print_status "Building agentica core packages..."
    pnpm --filter @agentica/core build
    pnpm --filter @agentica/rpc build
    
    # Build server
    print_status "Building server..."
    pnpm build
    cd ..
    
    # Build client
    print_status "Installing and building client..."
    cd client
    pnpm install
    pnpm build
    cd ..

    print_success "All dependencies installed and built successfully!"
}

# Main execution
main() {
    echo "Dockerina Web App Build Script"
    echo "=================================="
    echo ""
    
    # Check if we're in the right directory
    if [ ! -d "server" ] || [ ! -d "client" ]; then
        print_error "This script must be run from the root of the Dockerina project (server and client directories not found)"
        exit 1
    fi
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! check_node_version; then
        exit 1
    fi
    
    install_pnpm
    
    # Setup environment
    setup_env_files
    
    # Install and build
    build_project
    
    echo ""
    print_success "Build completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  Run the application: ./run.sh"
    echo "  Stop services: ./stop.sh"
    echo ""
}

# Parse command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "This script will:"
        echo "  1. Check Node.js and pnpm installation"
        echo "  2. Install project dependencies"
        echo "  3. Build all packages"
        echo "  4. Create environment files"
        echo ""
        echo "After building, use ./run.sh to start the services"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
