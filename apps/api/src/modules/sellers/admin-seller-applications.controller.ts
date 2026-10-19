import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

import {
  AdminSellerApplicationResponseDto,
  SellerApplicationPageDto,
} from './dto/admin-seller-application-response.dto';
import { ListSellerApplicationsQueryDto } from './dto/list-seller-applications-query.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { SellersService } from './sellers.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/seller-applications')
export class AdminSellerApplicationsController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  @ApiOperation({ summary: 'Seller applications, oldest first, optionally by status.' })
  @ApiOkResponse({ type: SellerApplicationPageDto })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query() query: ListSellerApplicationsQueryDto): Promise<SellerApplicationPageDto> {
    const { items, total } = await this.sellers.listApplications(query);
    return {
      items: items.map((item) => AdminSellerApplicationResponseDto.from(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an application and grant the SELLER role.' })
  @ApiOkResponse({ type: AdminSellerApplicationResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<AdminSellerApplicationResponseDto> {
    return AdminSellerApplicationResponseDto.from(await this.sellers.approve(admin.userId, id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an application with a reason.' })
  @ApiOkResponse({ type: AdminSellerApplicationResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: RejectApplicationDto,
  ): Promise<AdminSellerApplicationResponseDto> {
    return AdminSellerApplicationResponseDto.from(
      await this.sellers.reject(admin.userId, id, dto.reason),
    );
  }
}
