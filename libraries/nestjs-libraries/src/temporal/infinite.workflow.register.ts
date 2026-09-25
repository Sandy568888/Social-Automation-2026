import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  private readonly logger = new Logger(InfiniteWorkflowRegister.name);

  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!process.env.RUN_CRON) return;

    // M-10: reject missing Temporal client explicitly instead of silently swallowing
    const client = this._temporalService.client?.getRawClient();
    if (!client) {
      throw new Error('Temporal client is not available — cannot register infinite workflow. Check TEMPORAL_ADDRESS and connectivity.');
    }

    try {
      await client.workflow.start('missingPostWorkflow', {
        workflowId: 'missing-post-workflow',
        taskQueue: 'main',
      });
      this.logger.log('missingPostWorkflow enqueued successfully');
    } catch (err: any) {
      // WorkflowExecutionAlreadyStartedError means it is already running — that is fine
      if (err?.name === 'WorkflowExecutionAlreadyStartedError') {
        this.logger.log('missingPostWorkflow already running, skipping enqueue');
        return;
      }
      // Any other error is a real failure — log and rethrow so the process does not start silently broken
      this.logger.error('Failed to enqueue missingPostWorkflow', err);
      throw err;
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
