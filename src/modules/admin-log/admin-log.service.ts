import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminAction } from '../../common/constants';
import {
  AdminActionLog,
  AdminActionLogDocument,
} from './schemas/admin-action-log.schema';

export interface LogEntryInput {
  adminId: string;
  action: AdminAction;
  targetUserId?: string;
  reportId?: string;
  note?: string;
}

@Injectable()
export class AdminLogService {
  constructor(
    @InjectModel(AdminActionLog.name)
    private readonly logModel: Model<AdminActionLogDocument>,
  ) {}

  async record(entry: LogEntryInput): Promise<void> {
    await new this.logModel(entry).save();
  }
}
