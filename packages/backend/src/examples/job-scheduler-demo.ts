import { JobSchedulerService } from '../services/job-scheduler.service';
import { JobManagerService } from '../services/job-manager.service';
import { config } from '../config';
import { CrawlSession, CrawlConfig } from '@enterprise-web-crawler/shared';

/**
 * Demo script showing how to use the job scheduling system
 */
async function jobSchedulerDemo() {
  console.log('🚀 Starting Job Scheduler Demo...\n');

  // Initialize job scheduler with configuration
  const jobScheduler = new JobSchedulerService(config.jobScheduler);
  const jobManager = new JobManagerService(jobScheduler);

  // Set up event listeners
  jobManager.on('session:started', (sessionId, jobIds) => {
    console.log(`✅ Session ${sessionId} started with ${jobIds.length} jobs`);
  });

  jobManager.on('job:completed', (job) => {
    console.log(`✅ Job completed: ${job.id} (${job.type})`);
  });

  jobManager.on('job:failed', (job, error) => {
    console.log(`❌ Job failed: ${job.id} (${job.type}) - ${error.message}`);
  });

  jobManager.on('session:completed', (session) => {
    console.log(`🎉 Session completed: ${session.id}`);
  });

  try {
    // Create a sample crawl configuration
    const crawlConfig: CrawlConfig = {
      urls: [
        'https://example.com',
        'https://example.com/about',
        'https://example.com/contact'
      ],
      excludePaths: ['/admin', '/private'],
      maxDepth: 2,
      concurrency: 3,
      respectRobots: true
    };

    // Create a crawl session
    const session: CrawlSession = {
      id: 'demo-session-' + Date.now(),
      userId: 'demo-user',
      name: 'Demo Crawl Session',
      status: 'pending',
      config: crawlConfig,
      startTime: new Date(),
      progress: {
        totalUrls: crawlConfig.urls.length,
        processedUrls: 0,
        failedUrls: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`📋 Created session: ${session.id}`);
    console.log(`🔗 URLs to crawl: ${session.config.urls.length}`);
    console.log(`⚙️  Concurrency: ${session.config.concurrency}`);
    console.log(`🚫 Excluded paths: ${session.config.excludePaths.join(', ')}\n`);

    // Start the crawl session
    await jobManager.startCrawlSession(session);

    // Get initial system status
    const systemStatus = await jobManager.getSystemStatus();
    console.log('📊 Initial System Status:');
    console.log(`   Active sessions: ${systemStatus.activeSessions}`);
    console.log(`   Resource allocation: ${systemStatus.resourceAllocation.currentActiveJobs}/${systemStatus.resourceAllocation.maxConcurrentJobs} jobs`);
    console.log(`   Memory usage: ${systemStatus.resourceAllocation.memoryUsage}%\n`);

    // Wait a bit and then get queue stats
    await new Promise(resolve => setTimeout(resolve, 2000));

    const queueStats = await jobScheduler.getQueueStats();
    console.log('📈 Queue Statistics:');
    Object.entries(queueStats).forEach(([queueName, stats]) => {
      console.log(`   ${queueName}: waiting=${stats.waiting}, active=${stats.active}, completed=${stats.completed}, failed=${stats.failed}`);
    });

    // Demonstrate pause/resume functionality
    console.log('\n⏸️  Pausing session...');
    await jobManager.pauseCrawlSession(session.id);

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('▶️  Resuming session...');
    await jobManager.resumeCrawlSession(session.id);

    // Schedule a single job manually
    console.log('\n🔧 Scheduling manual job...');
    const manualJobId = await jobManager.scheduleJob('generate_report', {
      sessionId: session.id,
      config: crawlConfig
    }, 'high');

    console.log(`📝 Manual job scheduled: ${manualJobId}`);

    // Get job status
    const jobStatus = await jobManager.getJobStatus(manualJobId);
    if (jobStatus) {
      console.log(`📋 Job status: ${jobStatus.status} (${jobStatus.progress.percentage}% complete)`);
    }

    // Wait a bit more to see some job processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get final session status
    const sessionStatus = await jobManager.getSessionStatus(session.id);
    console.log('\n📊 Final Session Status:');
    if (sessionStatus.session) {
      console.log(`   Status: ${sessionStatus.session.status}`);
      console.log(`   Progress: ${sessionStatus.session.progress.processedUrls}/${sessionStatus.session.progress.totalUrls} URLs processed`);
      console.log(`   Failed: ${sessionStatus.session.progress.failedUrls} URLs`);
    }

    console.log('\n✨ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await jobManager.cleanup();
    console.log('✅ Cleanup completed');
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  jobSchedulerDemo().catch(console.error);
}

export { jobSchedulerDemo };