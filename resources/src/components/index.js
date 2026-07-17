import PublicTable from "./Public/PublicTable"

const Components = [
    PublicTable,
];

const install = app => {
    Components.forEach(component => {
        app.component(component.name, component)
    })
}

export default install
