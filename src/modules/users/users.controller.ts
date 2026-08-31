import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post('validate-login')
  validateLogin(@Body() dto: LoginUserDto) {
    return this.usersService.validateLogin(dto);
  }

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('email/:email')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get(':userId')
  findOne(@Param('userId') userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch(':userId')
  update(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }

  @Patch(':userId/password')
  changePassword(
    @Param('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  @Patch(':userId/email')
  changeEmail(@Param('userId') userId: string, @Body() dto: ChangeEmailDto) {
    return this.usersService.changeEmail(userId, dto);
  }

  @Patch(':userId/verify-email')
  verifyEmail(@Param('userId') userId: string) {
    return this.usersService.verifyEmail(userId);
  }

  @Patch(':userId/deactivate')
  deactivate(@Param('userId') userId: string) {
    return this.usersService.deactivate(userId);
  }

  @Patch(':userId/reactivate')
  reactivate(@Param('userId') userId: string) {
    return this.usersService.reactivate(userId);
  }

  @Patch(':userId/archive')
  archive(@Param('userId') userId: string) {
    return this.usersService.archive(userId);
  }

  @Patch(':userId/restore')
  restore(@Param('userId') userId: string) {
    return this.usersService.restore(userId);
  }

  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.usersService.remove(userId);
  }
}
