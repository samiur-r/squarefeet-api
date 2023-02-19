import { Entity, BaseEntity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

import { IPropertyType } from './interfaces';
import { IPost } from '../posts/interfaces';

@Entity('property_types')
export class PropertyType extends BaseEntity implements IPropertyType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ default: null })
  title_plural: string;

  @OneToMany('Post', 'property_type')
  post: IPost[];
}
