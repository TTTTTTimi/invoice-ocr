export default {
    name: 'renderDom',
    functional: true,
    props: {
        column: {
            type: Object,
            default: () => ({})
        },
        row: {
            type: Object,
            default: () => ({})
        },
        index: Number,
        render: Function
    },
    render: props => {
        const params = {
            row: props.row,
            $index: props.index
        }
        if(props.column) params.column = props.column;
        return props.render(params);
    }
}
