import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/constants';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRideDto } from './dto/create-ride.dto';
import { SearchRidesQueryDto } from './dto/search-rides-query.dto';
import { UpdateRideDto } from './dto/update-ride.dto';
import { RideOwnerGuard } from './guards/ride-owner.guard';
import { RidesService } from './rides.service';

@ApiTags('rides')
@ApiBearerAuth()
@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @ApiOperation({ summary: 'Post a ride (driver/both roles only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRideDto) {
    return this.ridesService.create(user.userId, dto);
  }

  @ApiOperation({ summary: "List the current user's posted rides" })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.findMine(user.userId);
  }

  @ApiOperation({ summary: 'Search rides, ranked by Smart Matching Score' })
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchRidesQueryDto,
  ) {
    return this.ridesService.search(user.userId, query);
  }

  // must stay below 'me' and 'search', otherwise those are read as an :id
  @ApiOperation({ summary: 'Ride detail with your match score' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.findOne(id, user.userId);
  }

  @ApiOperation({
    summary: 'Edit, pause, or cancel a ride (owner or admin only)',
  })
  @UseGuards(JwtAuthGuard, RideOwnerGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRideDto,
  ) {
    return this.ridesService.update(id, user.userId, dto);
  }
}
