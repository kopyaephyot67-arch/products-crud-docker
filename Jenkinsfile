pipeline {
    agent any
    
    triggers {
        // Poll SCM every 2 minutes (H/2 * * * *)
        pollSCM('H/2 * * * *')
    }
    
    environment {
        BUILD_TAG = "${env.BUILD_NUMBER}"
        GIT_COMMIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
    }
    
    parameters {
        booleanParam(
            name: 'CLEAN_VOLUMES',
            defaultValue: true,
            description: 'Remove volumes (clears database)'
        )
        string(
            name: 'API_HOST',
            defaultValue: 'http://192.168.56.1:4000',
            description: 'API host URL for frontend to connect to.'
        )
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "🔄 Checking out code..."
                    checkout scm
                    echo "Deploying to production environment"
                    echo "Build: ${BUILD_TAG}, Commit: ${GIT_COMMIT_SHORT}"
                }
            }
        }
        
        stage('Validate') {
            steps {
                script {
                    echo "🔍 Validating Docker Compose configuration..."
                    sh 'docker compose config'
                }
            }
        }
        
        stage('Prepare Environment') {
            steps {
                script {
                    echo "⚙️  Preparing environment configuration..."
                    
                    withCredentials([
                        string(credentialsId: 'MYSQL_ROOT_PASSWORD', variable: 'MYSQL_ROOT_PASS'),
                        string(credentialsId: 'MYSQL_PASSWORD', variable: 'MYSQL_PASS')
                    ]) {
                        sh """
                            cat > .env <<EOF
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASS}
MYSQL_DATABASE=products_db
MYSQL_USER=products_user
MYSQL_PASSWORD=${MYSQL_PASS}
MYSQL_PORT=3306
PHPMYADMIN_PORT=8888
API_PORT=4000
DB_PORT=3306
FRONTEND_PORT=3000
NODE_ENV=production
API_HOST=${params.API_HOST}
EOF
                        """
                    }
                    
                    echo "✅ Environment configuration created"
                }
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    echo "🚀 Deploying to production using Docker Compose..."
                    
                    // Stop existing containers
                    def downCommand = 'docker compose down'
                    if (params.CLEAN_VOLUMES) {
                        echo "⚠️  WARNING: Removing volumes (database will be cleared)"
                        downCommand = 'docker compose down -v'
                    }
                    sh downCommand
                    
                    // Build and start services
                    sh """
                        docker compose build --no-cache
                        docker compose up -d
                    """
                    
                    echo "✅ Deployment completed"
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    echo "⏳ Waiting for services to start..."
                    sh 'sleep 20'
                    
                    echo "🏥 Performing health check..."
                    sh """
                        # Check if containers are running
                        docker compose ps
                        
                        # Wait for API to be ready (max 60 seconds)
                        timeout 60 bash -c 'until curl -f http://localhost:4000/health; do sleep 2; done' || exit 1
                        
                        # Check products endpoint
                        curl -f http://localhost:4000/api/products || exit 1
                        
                        echo "✅ Health check passed!"
                    """
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    echo "📊 Verifying all services..."
                    sh """
                        echo "=== Container Status ==="
                        docker compose ps
                        echo ""
                        echo "=== Service Logs (last 20 lines) ==="
                        docker compose logs --tail=20
                        echo ""
                        echo "=== Deployed Services ==="
                        echo "Frontend: http://192.168.56.1:3000"
                        echo "API: http://192.168.56.1:4000"
                        echo "phpMyAdmin: http://192.168.56.1:8888"
                    """
                }
            }
        }
    }
    
    post {
        success {
            echo "✅ Deployment completed successfully!"
            echo "Build: ${BUILD_TAG}"
            echo "Commit: ${GIT_COMMIT_SHORT}"
            echo ""
            echo "Access your application:"
            echo " - Frontend: http://192.168.56.1:3000"
            echo " - API: http://192.168.56.1:4000/api/products"
            echo " - phpMyAdmin: http://192.168.56.1:8888"
        }
        failure {
            echo "❌ Deployment failed!"
            script {
                echo "Printing container logs for debugging..."
                sh 'docker compose logs --tail=50 || true'
            }
        }
        always {
            echo "🧹 Cleaning up old Docker resources..."
            sh """
                docker image prune -f
                docker container prune -f
            """
        }
    }
}