/**
 * Каскадер печатных форм
 *
 * @module MenuPrint
 *
 * Created by Evgeniy Malyarov on 15.05.2019.
 */

import React from 'react';
import PropTypes from 'prop-types';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import PrintIcon from '@material-ui/icons/Print';
import ChevronLeft from '@material-ui/icons/ChevronLeft';

class SubMenu extends React.Component {
  state = {anchorEl: null};

  handleOpen = (event) => {
    this.setState({anchorEl: event.currentTarget});
  };

  handleClose = () => {
    this.setState({ anchorEl: null });
  };

  render() {
    const {props: {items, Icon, text, handlePrint, prefix}, state: {anchorEl}} = this;
    return [
      <MenuItem key={`${prefix}_open`} onClick={this.handleOpen}>
        {Icon && <ListItemIcon><Icon/></ListItemIcon>}
        {text}
      </MenuItem>,
      <Menu key={`${prefix}_menu`}
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            onClose={this.handleClose}>
        {anchorEl && items.map((v) => <MenuItem key={v.ref} onClick={() => {
          handlePrint(v);
          this.handleClose();
        }}>{v.name}</MenuItem>)}
      </Menu>
    ];
  }
}

class MenuPrint extends SubMenu {

  state = {anchorEl: null, plates: []};

  componentDidMount() {
    const {_mgr} = this.props.scheme.child_meta();
    _mgr && _mgr.printing_plates()
      .then((plates) => {
        const groups = new Map();
        for(const key in plates) {
          const plate = plates[key];
          const group = plate.name.includes('/') ? plate.name.substr(0, plate.name.indexOf('/')).trim() : 'Общее';
          if(!groups.get(group)) {
            groups.set(group, []);
          }
          groups.get(group).push(plate);
        }
        plates = [];
        groups.forEach((value, name) => plates.push({name, value}));
        this.setState({plates});
      });
  }

  render() {
    const {props: {handlePrint}, state: {anchorEl, plates}} = this;
    if(plates.length === 1) {
      return <SubMenu
        items={plates[0].value}
        Icon={PrintIcon}
        text="Печать"
        handlePrint={handlePrint}
        prefix="root"
      />;
    }
    return [
      <MenuItem key="prn_open" onClick={this.handleOpen}>
        <ListItemIcon><PrintIcon/></ListItemIcon>Печать</MenuItem>,
      <Menu key="prn_menu"
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            onClose={this.handleClose}>
        {anchorEl && plates.map((plate, index) => <SubMenu
          key={`prn_${index}`}
          items={plate.value}
          Icon={ChevronLeft}
          text={plate.name}
          handlePrint={handlePrint}
          prefix={`prn_${index}`}
        />)}
      </Menu>
    ];
  }
}

MenuPrint.propTypes = {
  scheme: PropTypes.object.isRequired,            // значение настроек компоновки
  handlePrint: PropTypes.func.isRequired,         // обработчик открытия диалога печати
};

export default MenuPrint;