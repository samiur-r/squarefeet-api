import { Admin } from './model';

const saveAdmin = async (phone: string, password: string, name: string) => {
  const newAdmin = Admin.create({
    phone,
    password,
    name,
  });

  await Admin.save(newAdmin);
};

const findAdminByPhone = async (phone: string) => {
  const admin = await Admin.findOneBy({ phone });
  return admin;
};

export { saveAdmin, findAdminByPhone };
