module.exports = {
    apps : [{
      name: "Prometheus Backend",
      script: "dist/main.js",
      env: {
        NODE_ENV: ".env",
        NODE_APP_INSTANCE: "max"
      },
      env_production: {
        NODE_ENV: "production",
      }
    }]
  }
