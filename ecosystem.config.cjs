module.exports = {
  apps: [
    {
      name: "job-finder-approvals",
      script: "node",
      args: "--import tsx src/approval-listener-text.ts",
      cwd: "/home/ubuntu/job-finder-bot",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    }
  ]
}
