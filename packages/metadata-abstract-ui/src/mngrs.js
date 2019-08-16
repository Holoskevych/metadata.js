export default function mngrs() {

  const {classes, msg} = this;

  Object.defineProperties(classes.DataManager.prototype, {

    /**
     * ### Имя семейства объектов данного менеджера
     * Примеры: "справочников", "документов", "регистров сведений"
     * @property family_name
     * @type String
     * @final
     */
    family_name: {
      get () {
        return msg.meta_mgrs[this.class_name.split('.')[0]].replace(msg.meta_mgrs.mgr + ' ', '');
      }
    },

    /**
     * ### Текст подсказки "открыть форму выбора"
     * @property frm_selection_name
     * @type String
     */
    frm_selection_name: {
      get () {
        const meta = this.metadata();
        return `${msg.open_frm} ${msg.selection_parent} ${msg.meta_parents[this.class_name.split('.')[0]]} '${meta.synonym || meta.name}'`;
      }
    },

    /**
     * ### Текст подсказки "открыть форму объекта"
     * @property frm_obj_name
     * @type String
     */
    frm_obj_name: {
      get () {
        const meta = this.metadata();
        return `${msg.open_frm} ${msg.obj_parent} ${msg.meta_parents[this.class_name.split('.')[0]]} '${meta.synonym || meta.name}'`;
      }
    },

    /**
     * ### Фильтр для find_rows или find_rows_remote
     * @method get_search_selector
     * @return Object
     */
    get_search_selector: {
      value({_obj, _fld, _meta, search, top, skip, sorting}) {
        const {cachable, _owner, adapter} = this;
        const {md, utils, classes} = _owner.$p;
        const select = {};
        const {input_by_string, has_owners, hierarchical, group_hierarchy} = this.metadata();

        if(hierarchical) {
          if((group_hierarchy && _fld === 'parent') || (_meta && _meta.choice_groups_elm === 'grp')) {
            select.is_folder = true;
          }
          else if(_meta &&  _meta.choice_groups_elm === 'elm') {
            select.is_folder = false;
          }
        }

        if(/ram$/.test(cachable)) {

          select._top = top;
          select._skip = skip;

          // учтём сортировку
          if(sorting) {
            sorting.find_rows({use: true}, ({field, direction}) => {
              if(!select._sort) {
                select._sort = [];
              }
              select._sort.push({field, direction: direction.valueOf()});
            });
          }

          // поиск по строке
          if(search && input_by_string) {
            select._search = {
              fields: input_by_string,
              value: search.trim().replace(/\s\s/g, ' ').split(' ').filter(v => v),
            }
            // if(input_by_string.length > 1) {
            //   select.or = [];
            //   input_by_string.forEach((fld) => {
            //     select.or.push({[fld]: {like: search}});
            //   });
            // }
            // else {
            //   select[input_by_string[0]] = {like: search};
            // }
          }

          // для связей параметров выбора, значение берём из объекта
          _meta.choice_links && _meta.choice_links.forEach((choice) => {
            if(choice.name && choice.name[0] == 'selection') {
              if(utils.is_tabular(_obj)) {
                if(choice.path.length < 2) {
                  select[choice.name[1]] = typeof choice.path[0] == 'function' ? choice.path[0] : _obj._owner._owner[choice.path[0]];
                }
                else {
                  if(choice.name[1] == 'owner' && !has_owners) {
                    return;
                  }
                  select[choice.name[1]] = _obj[choice.path[1]];
                }
              }
              else {
                select[choice.name[1]] = typeof choice.path[0] == 'function' ? choice.path[0] : _obj[choice.path[0]];
              }
            }
          });

          // у параметров выбора, значение живёт внутри отбора
          _meta.choice_params && _meta.choice_params.forEach((choice) => {
            const fval = Array.isArray(choice.path) ? {in: choice.path} : choice.path;
            if(!select[choice.name]) {
              select[choice.name] = fval;
            }
            else if(Array.isArray(select[choice.name])) {
              select[choice.name].push(fval);
            }
            else {
              select[choice.name] = [select[choice.name]];
              select[choice.name].push(fval);
            }
          });

        }
        else if(adapter.db(this) instanceof classes.PouchDB){

          Object.assign(select, {
            selector: {class_name: this.class_name},
            fields: ['_id', 'name'],
            skip,
            limit: top
          });

          if(_meta.hierarchical) {
            select.fields.push('parent');
          }

          if(_meta.has_owners) {
            select.fields.push('owner');
          }

          // для связей параметров выбора, значение берём из объекта
          _meta.choice_links && _meta.choice_links.forEach((choice) => {
            if(choice.name && choice.name[0] == 'selection' && typeof choice.path[0] !== 'function') {
              const val = _obj[choice.path.length > 1 ? choice.path[1] : choice.path[0]];
              if(val != undefined && this.metadata(choice.name[1])){
                select.selector[choice.name[1]] = val.valueOf();
              }
            }
          });

          // у параметров выбора, значение живёт внутри отбора
          _meta.choice_params && _meta.choice_params.forEach((choice) => {
            const fval = Array.isArray(choice.path) ? {$in: choice.path.map(v => v.valueOf())} : choice.path.valueOf();
            if(fval.hasOwnProperty('not')){
              fval.$ne = fval.not;
              delete fval.not;
            }
            if(!select.selector[choice.name]) {
              select.selector[choice.name] = Array.isArray(choice.path) ? {$in: choice.path.map(v => v.valueOf())} : choice.path.valueOf();
            }
            else if(select.selector[choice.name].$in) {
              if(Array.isArray(choice.path)){
                choice.path.forEach(v => select.selector[choice.name].$in.push(v.valueOf()));
              }
              else{
                select.selector[choice.name].$in.push(choice.path.valueOf());
              }
            }
            else {
              select.selector[choice.name] = {$in: [select[choice.name]]};
              if(Array.isArray(choice.path)){
                choice.path.forEach(v => select.selector[choice.name].$in.push(v.valueOf()));
              }
              else{
                select.selector[choice.name].$in.push(choice.path.valueOf());
              }
            }
          });

          // поиск по строке
          if(search && input_by_string) {
            if(input_by_string.length > 1) {
              select.selector.$or = [];
              input_by_string.forEach((fld) => {
                select.selector.$or.push({[fld]: {$regex: `(?i)${search}`}});
              });
            }
            else {
              select.selector[input_by_string[0]] = {$regex: `(?i)${search}`};
            }
          }

        }

        return select;
      }
    }

  });


}
