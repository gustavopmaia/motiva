import { Injectable, NotFoundException } from "@nestjs/common";
import { IUserRepository } from "../domain/repositories/user.repository";

@Injectable()
export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async findByEmail(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new NotFoundException("User not found");
    return user;
  }
}
