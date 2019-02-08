import Dialog from '../../App/Dialog';
import React from 'react';

/**
 *
 *
 * @module OuterDialog
 *
 * Created by Evgeniy Malyarov on 22.10.2018.
 */

export default function OuterDialog(props) {

  const {_obj, _fld, dialogOpened, handleSelect, components: {DataList, DataObj, DataTree}, _owner} = props;
  const {_manager, ref} = _obj[_fld];
  const _acl = $p.current_user.get_acl(_manager.class_name);
  const title = (dialogOpened == 'list' || dialogOpened == 'tree') ?
    (_manager.metadata().list_presentation || _manager.metadata().synonym)
    :
    (_manager.metadata().obj_presentation || _manager.metadata().synonym);

  return <Dialog
    key="down-dialog"
    open
    noSpace
    title={title}
    onClose={props.handleCloseDialog}
  >
    {dialogOpened == 'list' ?
      <DataList _mgr={_manager} _acl={_acl} _owner={_owner} selectionMode handlers={{handleSelect}}/>
      :
      (dialogOpened == 'tree' ?
        <DataTree _mgr={_manager} _acl={_acl} _owner={_owner} selectionMode denyAddDel handlers={{handleSelect}}/>
        :
        <DataObj _mgr={_manager} _acl={_acl} match={{params: {ref}}} handlers={{}}/>
      )
    }
  </Dialog>;
}
