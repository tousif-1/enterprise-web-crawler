# Git Repository Setup Commands

## After creating your remote repository, run these commands:

### Option 1: Using HTTPS (recommended for first-time setup)
```powershell
# Add the remote repository (replace with your actual repository URL)
git remote add origin https://github.com/yourusername/enterprise-web-crawler.git

# Verify the remote was added
git remote -v

# Push the code to the remote repository
git push -u origin master
```

### Option 2: Using SSH (if you have SSH keys configured)
```powershell
# Add the remote repository (replace with your actual repository URL)
git remote add origin git@github.com:yourusername/enterprise-web-crawler.git

# Verify the remote was added
git remote -v

# Push the code to the remote repository
git push -u origin master
```

## Verification Commands
```powershell
# Check current branch and status
git status

# View commit history
git log --oneline

# Check remote repositories
git remote -v
```

## Repository Information
- **Project**: Enterprise Web Crawler
- **Description**: Enterprise-grade web crawler for marketing site analysis with accessibility compliance checking
- **Features**: 
  - Web interface for URL selection
  - Real-time broken link detection
  - WCAG 2.2 AA accessibility compliance checking
  - Searchable indexed results
  - Multi-platform deployment (Mac, Windows, Docker, AWS)
  - Scalable to 75,000+ links across 150 countries

## Files Included in Repository
- Complete monorepo structure (255 files, 63,950+ lines)
- Frontend: React + TypeScript + Material-UI
- Backend: Node.js + Express + TypeScript
- Crawler: Puppeteer + Axe-core accessibility engine
- Infrastructure: Docker + AWS Terraform configurations
- Comprehensive test suites and documentation