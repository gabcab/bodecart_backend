import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { EmailService } from './email.service';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus, AuthProvider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phone, role, avatar } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // User exists — check if they already have this role
      if (existingUser.roles.includes(role)) {
        throw new ConflictException('Ya estas registrado con este rol');
      }

      // Verify password to confirm identity
      if (!existingUser.password || !(await bcrypt.compare(password, existingUser.password))) {
        throw new UnauthorizedException('Password incorrecto para la cuenta existente');
      }

      // Add new role and create profile
      await this.prisma.$transaction(async (prisma) => {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { roles: { push: role } },
        });
        await this.createRoleProfile(prisma, existingUser.id, role);
      });

      // If user is already verified, return tokens directly (no OTP needed)
      if (existingUser.status === UserStatus.ACTIVE) {
        const tokens = await this.generateTokens(existingUser.id, email, role);
        return {
          user: {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            phone: existingUser.phone,
            role: role,
            roles: [...existingUser.roles, role],
            avatar: existingUser.avatar,
            status: existingUser.status,
            createdAt: existingUser.createdAt,
            updatedAt: existingUser.updatedAt,
            lastLogin: existingUser.lastLogin,
          },
          ...tokens,
          roleAdded: true,
        };
      }

      // User not yet verified — send OTP
      await this.sendOtp(email);
      return {
        message: 'Rol agregado. Verifica tu email con el OTP enviado.',
        email,
        requiresVerification: true,
      };
    }

    // New user — create from scratch
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.$transaction(async (prisma) => {
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          roles: [role],
          avatar,
          status: UserStatus.PENDING_VERIFICATION,
        },
      });

      await this.createRoleProfile(prisma, newUser.id, role);
      return newUser;
    });

    // Send OTP for email verification
    await this.sendOtp(email);

    return {
      message: 'Registration successful. Please verify your email with the OTP sent.',
      email: user.email,
      requiresVerification: true,
    };
  }

  private async createRoleProfile(prisma: any, userId: string, role: UserRole) {
    switch (role) {
      case UserRole.CLIENT:
        await prisma.client.create({
          data: { userId },
        });
        break;
      case UserRole.BODEGA_OWNER:
        await prisma.bodegaOwner.create({
          data: { userId },
        });
        break;
      case UserRole.DELIVERY_PERSON:
        await prisma.deliveryPerson.create({
          data: { userId, isAvailable: false },
        });
        break;
    }
  }

  async sendOtp(email: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('User is already verified');
    }

    // Delete any existing OTPs for this email
    await this.prisma.emailOtp.deleteMany({
      where: { email },
    });

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // OTP expires in 10 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Store OTP in database
    await this.prisma.emailOtp.create({
      data: {
        email,
        code,
        expiresAt,
      },
    });

    // Send OTP via email (or log to console if email is disabled)
    const emailSent = await this.emailService.sendOtpEmail(email, code);

    const isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';
    const emailEnabled = this.configService.get<string>('ENABLE_EMAIL_VERIFICATION') === 'true';

    return {
      message: emailEnabled
        ? 'OTP sent successfully to your email'
        : isDevelopment
          ? `Development mode: Check console logs for OTP code`
          : 'OTP sent successfully',
      email,
      emailSent,
      ...(isDevelopment && !emailEnabled ? { otpInConsole: true } : {}),
    };
  }

  async verifyOtp(email: string, code: string, role?: UserRole) {
    const otp = await this.prisma.emailOtp.findFirst({
      where: {
        email,
        code,
        verified: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Mark OTP as verified
    await this.prisma.emailOtp.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    // Activate user
    const user = await this.prisma.user.update({
      where: { email },
      data: { status: UserStatus.ACTIVE },
    });

    // Determine which role to use for the session
    const activeRole = role && user.roles.includes(role)
      ? role
      : user.roles[user.roles.length - 1]; // Last added role

    // Generate tokens and return auth response
    const tokens = await this.generateTokens(user.id, user.email, activeRole);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: activeRole,
        roles: user.roles,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
      },
      ...tokens,
    };
  }

  async resendOtp(email: string) {
    return this.sendOtp(email);
  }

  async login(loginDto: LoginDto) {
    const { email, password, role: requestedRole } = loginDto;

    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is verified
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      // Send new OTP for verification
      await this.sendOtp(email);
      throw new UnauthorizedException('Please verify your email first. A new OTP has been sent.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your account is not active. Please contact support.');
    }

    // Determine active role for this session
    let activeRole: UserRole;
    if (requestedRole) {
      if (!user.roles.includes(requestedRole)) {
        throw new UnauthorizedException('No tienes el rol solicitado. Registrate primero.');
      }
      activeRole = requestedRole;
    } else {
      activeRole = user.roles[0]; // Default to first role
    }

    const tokens = await this.generateTokens(user.id, user.email, activeRole);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: activeRole,
        roles: user.roles,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
      },
      ...tokens,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    if (!user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  async googleAuth(idToken: string, role?: UserRole) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!googleClientId) {
      throw new BadRequestException('Google Sign-In is not configured');
    }

    const client = new OAuth2Client(googleClientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Invalid Google ID token payload');
    }

    const { sub: googleId, email, given_name, family_name, picture } = payload;
    const requestedRole = role || UserRole.CLIENT;

    // Look up user by googleId or email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email },
        ],
      },
    });

    if (user) {
      // Link Google account if not already linked
      const updateData: any = {};
      if (!user.googleId) {
        updateData.googleId = googleId;
        updateData.authProvider = AuthProvider.GOOGLE;
      }
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        updateData.status = UserStatus.ACTIVE;
      }
      if (picture && !user.avatar) {
        updateData.avatar = picture;
      }

      // Add role if user doesn't have it yet
      if (!user.roles.includes(requestedRole)) {
        updateData.roles = { push: requestedRole };
        // Create the role profile
        await this.createRoleProfile(this.prisma, user.id, requestedRole);
      }

      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    } else {
      // Create new user with Google account
      user = await this.prisma.$transaction(async (prisma) => {
        const newUser = await prisma.user.create({
          data: {
            email,
            firstName: given_name || '',
            lastName: family_name || '',
            avatar: picture || null,
            roles: [requestedRole],
            status: UserStatus.ACTIVE,
            authProvider: AuthProvider.GOOGLE,
            googleId,
          },
        });

        await this.createRoleProfile(prisma, newUser.id, requestedRole);
        return newUser;
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, requestedRole);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: requestedRole,
        roles: user.roles,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.sub,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Delete old token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      // Preserve the role from the original JWT payload
      const activeRole = payload.role || user.roles[0];
      const tokens = await this.generateTokens(user.id, user.email, activeRole);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: refreshToken,
      },
    });

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const genericMessage = 'Si el correo está registrado, recibirás instrucciones para continuar.';
    
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Simulate typical processing time to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 500));
      return { message: genericMessage, emailSent: false };
    }

    if (user.authProvider === AuthProvider.GOOGLE || !user.password) {
      // Send the Google Account Notice email
      await this.emailService.sendGoogleAccountNotice(email);
      return { message: genericMessage, emailSent: true };
    }

    // Delete existing reset tokens
    await this.prisma.passwordResetToken.deleteMany({
      where: { email },
    });

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(code, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await this.prisma.passwordResetToken.create({
      data: {
        email,
        hashedOtp,
        expiresAt,
      },
    });

    const emailSent = await this.emailService.sendPasswordResetOtp(email, code);

    const isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';
    const emailEnabled = this.configService.get<string>('ENABLE_EMAIL_VERIFICATION') === 'true';

    return {
      message: genericMessage,
      emailSent,
      ...(isDevelopment && !emailEnabled ? { otpInConsole: true } : {}),
    };
  }

  async resetPassword(resetDto: { email: string; otp: string; newPassword: string }) {
    const { email, otp, newPassword } = resetDto;

    const tokenRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        email,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('El código es inválido o ha expirado');
    }

    const isMatch = await bcrypt.compare(otp, tokenRecord.hashedOtp);
    if (!isMatch) {
      throw new BadRequestException('El código introducido es incorrecto');
    }

    // Hash new password
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user
    await this.prisma.user.update({
      where: { email },
      data: { password: newHashedPassword },
    });

    // Delete token
    await this.prisma.passwordResetToken.delete({
      where: { id: tokenRecord.id },
    });

    // Optional: Delete all refresh tokens to force re-login on all devices
    await this.prisma.refreshToken.deleteMany({
      where: { user: { email } },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '1h',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
