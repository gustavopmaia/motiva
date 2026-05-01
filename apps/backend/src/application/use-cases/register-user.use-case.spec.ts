import { RegisterUserUseCase } from "./register-user.use-case";
import { User } from "@domain/entities/user.entity";
import { AuthorizationError, DuplicateResourceError } from "@application/errors";

const makeUseCase = (existingUser: User | null = null) => {
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(existingUser),
    save: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
  };
  return { useCase: new RegisterUserUseCase(userRepository as any), userRepository };
};

describe("RegisterUserUseCase", () => {
  it("deve criar usuário field por padrão", async () => {
    const { useCase, userRepository } = makeUseCase();

    await useCase.execute("field@motiva.app", "Field", "senha123", "manager");

    const savedUser: User = userRepository.save.mock.calls[0][0];
    expect(savedUser.role).toBe("field");
  });

  it("deve criar usuário manager quando role manager é solicitado", async () => {
    const { useCase, userRepository } = makeUseCase();

    await useCase.execute("manager2@motiva.app", "Manager 2", "senha123", "manager", "manager");

    const savedUser: User = userRepository.save.mock.calls[0][0];
    expect(savedUser.role).toBe("manager");
  });

  it("deve lançar AuthorizationError quando não-manager tenta registrar", async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute("field@motiva.app", "Field", "senha123", "field")).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("deve lançar DuplicateResourceError quando o e-mail já está cadastrado", async () => {
    const existing = new User("u-1", "dup@motiva.app", "Dup", "hash", "field");
    const { useCase } = makeUseCase(existing);

    await expect(useCase.execute("dup@motiva.app", "Dup", "senha123", "manager")).rejects.toThrow(
      DuplicateResourceError,
    );
  });
});
