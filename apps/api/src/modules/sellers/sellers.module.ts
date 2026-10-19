import { Module } from '@nestjs/common';

import { UsersModule } from '../users';

import { AdminSellerApplicationsController } from './admin-seller-applications.controller';
import { SellersController } from './sellers.controller';
import { SellersRepository } from './sellers.repository';
import { SellersService } from './sellers.service';

@Module({
  imports: [UsersModule],
  controllers: [SellersController, AdminSellerApplicationsController],
  providers: [SellersRepository, SellersService],
  exports: [SellersService],
})
export class SellersModule {}
