import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

export interface ElasticsearchConfig {
  node: string;
  auth?: {
    username: string;
    password: string;
  };
  tls?: {
    rejectUnauthorized: boolean;
  };
  requestTimeout?: number;
  pingTimeout?: number;
  maxRetries?: number;
}

export class ElasticsearchClient {
  private client: Client;
  private config: ElasticsearchConfig;

  constructor(config: ElasticsearchConfig) {
    this.config = config;
    this.client = new Client({
      node: config.node,
      auth: config.auth,
      tls: config.tls,
      requestTimeout: config.requestTimeout || 30000,
      pingTimeout: config.pingTimeout || 3000,
      maxRetries: config.maxRetries || 3,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      logger.info('Connected to Elasticsearch');
    } catch (error) {
      logger.error('Failed to connect to Elasticsearch:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      logger.info('Disconnected from Elasticsearch');
    } catch (error) {
      logger.error('Error disconnecting from Elasticsearch:', error);
    }
  }

  getClient(): Client {
    return this.client;
  }

  async createIndex(indexName: string, mapping: any): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          mappings: mapping,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                html_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  char_filter: ['html_strip'],
                  filter: ['lowercase', 'stop']
                }
              }
            }
          }
        });
        logger.info(`Created Elasticsearch index: ${indexName}`);
      }
    } catch (error) {
      logger.error(`Failed to create index ${indexName}:`, error);
      throw error;
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (exists) {
        await this.client.indices.delete({ index: indexName });
        logger.info(`Deleted Elasticsearch index: ${indexName}`);
      }
    } catch (error) {
      logger.error(`Failed to delete index ${indexName}:`, error);
      throw error;
    }
  }
}

// Default configuration from environment variables
export const getElasticsearchConfig = (): ElasticsearchConfig => {
  return {
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD ? {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    } : undefined,
    tls: {
      rejectUnauthorized: process.env.ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED !== 'false'
    },
    requestTimeout: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000'),
    pingTimeout: parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT || '3000'),
    maxRetries: parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3')
  };
};

// Singleton instance
let elasticsearchClient: ElasticsearchClient | null = null;

export const getElasticsearchClient = (): ElasticsearchClient => {
  if (!elasticsearchClient) {
    elasticsearchClient = new ElasticsearchClient(getElasticsearchConfig());
  }
  return elasticsearchClient;
};