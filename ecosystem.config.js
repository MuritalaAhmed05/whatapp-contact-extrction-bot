module.exports = {
  apps: [
    {
      name: "next-extraction-bot",
      script: "./server.js",
      instances: 1, // Keep at 1 instance to avoid session locking and multiple Puppeteer instances fighting for auth
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G", // Restart if memory exceeds 1GB
      env: {
        NODE_ENV: "development",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        // The ARM64 Chromium executable path on OCI Ubuntu VMs
        PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium-browser"
      }
    }
  ]
};
